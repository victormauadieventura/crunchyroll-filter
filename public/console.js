(() => {
  window.CR_TOOL?.stop?.();

  const CR_BASE_URL = "https://www.crunchyroll.com";
  const CR_LOCALE = "pt-BR";

  const state = {
    byId: new Map(),
    requests: [],
    rawResponses: [],
    authToken: "",
    startedAt: new Date().toISOString(),
    renderTimer: null,
    observer: null,
    genreFrame: null,
    genreEnrichRunning: false
  };

  const clean = (value) =>
    String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const norm = (value) =>
    clean(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const unique = (arr) => [...new Set((arr || []).map(clean).filter(Boolean))];

  const isPlainNumber = (value) => /^\d+$/.test(clean(value));

  const isAgeRating = (value) => {
    const x = norm(value);
    return (
      x === "livre" ||
      x === "l" ||
      x === "al" ||
      /^a?(10|12|14|16|18)$/.test(x)
    );
  };

  const getIdFromUrl = (url) =>
    String(url).match(/\/series\/([^/?#]+)/)?.[1] || "";

  const getSlugFromUrl = (url) =>
    String(url).match(/\/series\/[^/]+\/([^/?#]+)/)?.[1] || "";

  const isContentUrl = (url) =>
    String(url).includes("/content/v2/") || String(url).includes("/cms/v2/");

  const buildOfficialUrl = ({ id, slug, url }) => {
    if (url && String(url).includes("/series/")) return url;
    if (id && slug) return `${CR_BASE_URL}/pt-br/series/${id}/${slug}`;
    if (id) return `${CR_BASE_URL}/pt-br/series/${id}`;
    return "";
  };

  const getRatingValue = (value) => {
    if (!value) return "";

    if (typeof value === "object") {
      return clean(value.average ?? value.rating ?? value.score ?? "");
    }

    return clean(value);
  };

  function walk(obj, visitor, path = []) {
    if (obj == null) return;

    visitor(obj, path);

    if (Array.isArray(obj)) {
      obj.forEach((value, index) => walk(value, visitor, [...path, index]));
      return;
    }

    if (typeof obj === "object") {
      Object.entries(obj).forEach(([key, value]) =>
        walk(value, visitor, [...path, key])
      );
    }
  }

  function localizedText(value) {
    if (!value) return "";

    if (typeof value === "string" || typeof value === "number") {
      return clean(value);
    }

    if (typeof value !== "object") return "";

    const keys = [
      "pt-BR",
      "pt-br",
      "pt_BR",
      "pt",
      "en-US",
      "en-us",
      "en",
      "title",
      "name",
      "label",
      "value",
      "displayValue",
      "slug",
      "description"
    ];

    for (const key of keys) {
      if (typeof value[key] === "string" || typeof value[key] === "number") {
        return clean(value[key]);
      }
    }

    if (value.localization) {
      const text = localizedText(value.localization);
      if (text) return text;
    }

    if (Array.isArray(value.localizations)) {
      for (const item of value.localizations) {
        const text = localizedText(item);
        if (text) return text;
      }
    }

    return "";
  }

  function findStringsByKey(obj, keyPatterns) {
    const out = [];

    walk(obj, (value, path) => {
      const key = String(path[path.length - 1] || "");
      const keyNorm = norm(key);
      const keyMatches = keyPatterns.some((pattern) =>
        keyNorm.includes(norm(pattern))
      );

      if (!keyMatches) return;

      if (typeof value === "string" || typeof value === "number") {
        out.push(value);
      }

      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (typeof entry === "string" || typeof entry === "number") {
            out.push(entry);
          }

          if (entry && typeof entry === "object") {
            [
              "title",
              "name",
              "label",
              "value",
              "locale",
              "audio_locale",
              "subtitle_locale",
              "description",
              "guidance",
              "rating",
              "code",
              "slug",
              "displayValue"
            ].forEach((entryKey) => {
              if (
                typeof entry[entryKey] === "string" ||
                typeof entry[entryKey] === "number"
              ) {
                out.push(entry[entryKey]);
              }
            });
          }
        });
      }

      if (value && typeof value === "object" && !Array.isArray(value)) {
        [
          "title",
          "name",
          "label",
          "value",
          "description",
          "guidance",
          "rating",
          "code",
          "slug",
          "displayValue"
        ].forEach((entryKey) => {
          if (
            typeof value[entryKey] === "string" ||
            typeof value[entryKey] === "number"
          ) {
            out.push(value[entryKey]);
          }
        });
      }
    });

    return unique(out);
  }

  function findFirstByKey(obj, keyPatterns) {
    return findStringsByKey(obj, keyPatterns)[0] || "";
  }

  function extractImages(obj) {
    const urls = [];

    walk(obj, (value) => {
      if (
        typeof value === "string" &&
        value.includes("imgsrv.crunchyroll.com")
      ) {
        urls.push(value);
      }
    });

    const posterTall =
      urls.find((url) => /poster/i.test(url) && /tall/i.test(url)) ||
      urls.find((url) => /poster/i.test(url)) ||
      urls.find((url) => /catalog\/crunchyroll/i.test(url)) ||
      urls[0] ||
      "";

    return {
      cover: posterTall,
      images: unique(urls)
    };
  }

  function isBadLocaleValue(value) {
    const x = norm(value);

    return (
      !x ||
      x === "true" ||
      x === "false" ||
      isPlainNumber(value) ||
      isAgeRating(value) ||
      /^\d+(\.\d+)?$/.test(x)
    );
  }

  function extractAudio(obj) {
    const out = [];

    out.push(
      ...findStringsByKey(obj, [
        "audio_locale",
        "audio_locales",
        "available_audio_locales",
        "audio_language",
        "audio_languages",
        "audio"
      ])
    );

    if (Array.isArray(obj?.versions)) {
      obj.versions.forEach((version) => {
        if (version.audio_locale) out.push(version.audio_locale);
        if (version.audio_language) out.push(version.audio_language);
        if (version.media_locale) out.push(version.media_locale);
      });
    }

    return unique(out).filter((value) => !isBadLocaleValue(value));
  }

  function extractSubtitles(obj) {
    const out = [];

    out.push(
      ...findStringsByKey(obj, [
        "subtitle_locale",
        "subtitle_locales",
        "available_subtitle_locales",
        "subtitle_language",
        "subtitle_languages",
        "subtitles"
      ])
    );

    if (Array.isArray(obj?.versions)) {
      obj.versions.forEach((version) => {
        if (version.subtitle_locale) out.push(version.subtitle_locale);
        if (Array.isArray(version.subtitle_locales)) {
          out.push(...version.subtitle_locales);
        }
      });
    }

    return unique(out).filter((value) => !isBadLocaleValue(value));
  }

  const RELEASE_SEASON_RE =
    /^(primavera|ver[aã]o|outono|inverno|spring|summer|fall|autumn|winter)[-\s]?\d{4}$/i;

  const REAL_GENRE_MAP = new Map(
    [
      ["ação", "Ação"],
      ["action", "Ação"],

      ["aventura", "Aventura"],
      ["adventure", "Aventura"],

      ["comédia", "Comédia"],
      ["comedia", "Comédia"],
      ["comedy", "Comédia"],

      ["drama", "Drama"],

      ["fantasia", "Fantasia"],
      ["fantasy", "Fantasia"],

      ["romance", "Romance"],

      ["ficção científica", "Ficção Científica"],
      ["ficcao cientifica", "Ficção Científica"],
      ["science fiction", "Ficção Científica"],
      ["sci-fi", "Ficção Científica"],
      ["sci fi", "Ficção Científica"],
      ["scifi", "Ficção Científica"],

      ["terror", "Terror"],
      ["horror", "Terror"],

      ["suspense", "Suspense"],
      ["thriller", "Suspense"],

      ["mistério", "Mistério"],
      ["misterio", "Mistério"],
      ["mystery", "Mistério"],

      ["slice of life", "Slice of Life"],
      ["vida cotidiana", "Slice of Life"],

      ["isekai", "Isekai"],

      ["mecha", "Mecha"],

      ["magia", "Magia"],
      ["magic", "Magia"],

      ["sobrenatural", "Sobrenatural"],
      ["supernatural", "Sobrenatural"],

      ["esportes", "Esportes"],
      ["esporte", "Esportes"],
      ["sports", "Esportes"],

      ["musical", "Musical"],
      ["música", "Musical"],
      ["musica", "Musical"],
      ["music", "Musical"],

      ["shonen", "Shonen"],
      ["shounen", "Shonen"],

      ["shojo", "Shojo"],
      ["shoujo", "Shojo"],

      ["seinen", "Seinen"],
      ["josei", "Josei"],

      ["escolar", "Escolar"],
      ["vida escolar", "Escolar"],
      ["school", "Escolar"],

      ["histórico", "Histórico"],
      ["historico", "Histórico"],
      ["história", "Histórico"],
      ["historia", "Histórico"],
      ["historical", "Histórico"],

      ["psicológico", "Psicológico"],
      ["psicologico", "Psicológico"],
      ["psychological", "Psicológico"],

      ["crime", "Crime"],
      ["policial", "Crime"],

      ["gourmet", "Gourmet"],
      ["culinária", "Gourmet"],
      ["culinaria", "Gourmet"],

      ["idol", "Idol"],
      ["idols", "Idol"],

      ["harem", "Harem"],

      ["ecchi", "Ecchi"],

      ["militar", "Militar"],
      ["military", "Militar"],

      ["artes marciais", "Artes Marciais"],
      ["martial arts", "Artes Marciais"],

      ["família", "Família"],
      ["familia", "Família"],
      ["family", "Família"]
    ].map(([key, value]) => [norm(key), value])
  );

  const KNOWN_GENRES = [...new Set([...REAL_GENRE_MAP.values()])];

  function isReleaseSeason(value) {
    return RELEASE_SEASON_RE.test(clean(value));
  }

  function splitGenreText(value) {
    return clean(value)
      .replace(/^g[eê]neros?\s*:?/i, "")
      .replace(/^genres?\s*:?/i, "")
      .split(/[•|・,;/\n]/)
      .map(clean)
      .filter(Boolean);
  }

  function canonicalGenre(value) {
    const raw = clean(value);
    const x = norm(raw);

    if (!raw) return "";
    if (isReleaseSeason(raw)) return "";
    if (isPlainNumber(raw)) return "";
    if (isAgeRating(raw)) return "";
    if (/^\d+(\.\d+)?$/.test(raw)) return "";
    if (/^https?:\/\//i.test(raw)) return "";
    if (raw.length > 60) return "";

    const direct = REAL_GENRE_MAP.get(x);
    if (direct) return direct;

    const normalizedSlug = x.replace(/[-_]+/g, " ");
    return REAL_GENRE_MAP.get(normalizedSlug) || "";
  }

  function addGenre(out, value) {
    splitGenreText(value).forEach((part) => {
      const genre = canonicalGenre(part);
      if (genre) out.add(genre);
    });
  }

  function addGenresByDictionary(out, value) {
    const textNorm = ` ${norm(value).replace(/[-_]+/g, " ")} `;

    for (const genre of KNOWN_GENRES) {
      const g = norm(genre).replace(/[-_]+/g, " ");
      const escaped = g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");

      if (regex.test(textNorm)) {
        out.add(genre);
      }
    }

    for (const [key, valueGenre] of REAL_GENRE_MAP.entries()) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");

      if (regex.test(textNorm)) {
        out.add(valueGenre);
      }
    }
  }

  function pathLooksGenreRelated(path) {
    const p = norm(path.join("."));

    if (p.includes("genre")) return true;

    if (
      p.includes("category") ||
      p.includes("categories") ||
      p.includes("tag") ||
      p.includes("tags")
    ) {
      if (
        p.includes("season") ||
        p.includes("release") ||
        p.includes("calendar") ||
        p.includes("simulcast")
      ) {
        return false;
      }

      return true;
    }

    return false;
  }

  function objectLooksReleaseBucket(obj) {
    if (!obj || typeof obj !== "object") return false;

    const type = norm(
      obj.type ||
        obj.category_type ||
        obj.collection_type ||
        obj.group ||
        obj.kind ||
        obj.bucket ||
        ""
    );

    const slug = norm(obj.slug || obj.id || obj.external_id || "");
    const text = localizedText(obj);

    return (
      isReleaseSeason(text) ||
      type.includes("season") ||
      type.includes("release") ||
      type.includes("calendar") ||
      type.includes("simulcast") ||
      slug.includes("season") ||
      slug.includes("release") ||
      slug.includes("calendar") ||
      slug.includes("simulcast")
    );
  }

  function extractGenresFromObject(obj) {
    const out = new Set();

    if (!obj || typeof obj !== "object") return [];

    walk(obj, (value, path) => {
      if (value == null) return;
      if (!pathLooksGenreRelated(path)) return;

      if (typeof value === "string" || typeof value === "number") {
        addGenre(out, value);
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (typeof entry === "string" || typeof entry === "number") {
            addGenre(out, entry);
            return;
          }

          if (entry && typeof entry === "object") {
            if (objectLooksReleaseBucket(entry)) return;

            const text = localizedText(entry);
            if (text) addGenre(out, text);
          }
        });

        return;
      }

      if (value && typeof value === "object") {
        if (objectLooksReleaseBucket(value)) return;

        const text = localizedText(value);
        if (text) addGenre(out, text);
      }
    });

    return unique([...out]);
  }

  function extractGenres(obj) {
    return extractGenresFromObject(obj);
  }

  function extractGenresFromDOMImproved(box, fullText = "") {
    const out = new Set();

    const selector = [
      "[class*='genre']",
      "[class*='Genre']",
      "[data-t*='genre']",
      "[data-testid*='genre']",
      "a[href*='genre']",
      "a[href*='genres']"
    ].join(",");

    box.querySelectorAll(selector).forEach((el) => {
      const text = clean(el.innerText || el.textContent);
      addGenre(out, text);
      addGenresByDictionary(out, text);
    });

    clean(fullText)
      .split(/[•|・,;/\n]/)
      .forEach((part) => addGenre(out, part));

    return unique([...out]);
  }

  function extractJsonFromScriptText(text) {
    const found = [];
    const trimmed = String(text || "").trim();

    if (!trimmed) return found;

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        found.push(JSON.parse(trimmed));
      } catch {}
    }

    const jsonParseRegex = /JSON\.parse\((["'`])([\s\S]*?)\1\)/g;
    let match;

    while ((match = jsonParseRegex.exec(text))) {
      try {
        const unescaped = JSON.parse(match[1] + match[2] + match[1]);
        found.push(JSON.parse(unescaped));
      } catch {}
    }

    return found;
  }

  function extractGenresFromDocument(doc) {
    const out = new Set();

    if (!doc) return [];

    const selector = [
      "[class*='genre']",
      "[class*='Genre']",
      "[data-t*='genre']",
      "[data-testid*='genre']",
      "a[href*='genre']",
      "a[href*='genres']"
    ].join(",");

    doc.querySelectorAll(selector).forEach((el) => {
      const text = clean(el.innerText || el.textContent);
      addGenre(out, text);
      addGenresByDictionary(out, text);
    });

    doc.querySelectorAll("section, div, li").forEach((el) => {
      const text = clean(el.innerText || el.textContent);
      const x = norm(text);

      if (!text || text.length > 500) return;

      if (
        x.includes("genero") ||
        x.includes("generos") ||
        x.includes("genre") ||
        x.includes("genres")
      ) {
        addGenre(out, text);
        addGenresByDictionary(out, text);
      }
    });

    doc
      .querySelectorAll("meta[property='article:tag'], meta[name='keywords']")
      .forEach((meta) => {
        addGenre(out, meta.getAttribute("content") || "");
      });

    doc.querySelectorAll("script").forEach((script) => {
      const text = script.textContent || "";

      extractJsonFromScriptText(text).forEach((json) => {
        extractGenresFromObject(json).forEach((genre) => out.add(genre));
      });

      const keyRegex =
        /["'](?:genres?|genre_title|genre_name|categories|category|tags)["']\s*:\s*(\[[\s\S]{0,1600}?\]|"[^"]{1,160}"|'[^']{1,160}'|\{[\s\S]{0,1600}?\})/gi;

      let match;

      while ((match = keyRegex.exec(text))) {
        const block = match[1];

        [...block.matchAll(/["']([^"']{2,100})["']/g)].forEach((m) => {
          addGenre(out, m[1]);
        });
      }
    });

    return unique([...out]);
  }

  async function extractGenresFromIframe(url, options = {}) {
    if (!url) return [];

    const timeoutMs = Number(options.timeoutMs || 7000);

    if (!state.genreFrame) {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-99999px";
      iframe.style.top = "-99999px";
      iframe.style.width = "1200px";
      iframe.style.height = "900px";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";
      iframe.setAttribute("aria-hidden", "true");

      document.body.appendChild(iframe);
      state.genreFrame = iframe;
    }

    const iframe = state.genreFrame;

    return new Promise((resolve) => {
      let done = false;
      const started = Date.now();

      const finish = (genres) => {
        if (done) return;
        done = true;
        iframe.onload = null;
        resolve(unique(genres || []));
      };

      const poll = () => {
        if (done) return;

        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;

          if (doc) {
            const genres = extractGenresFromDocument(doc);
            if (genres.length) {
              finish(genres);
              return;
            }
          }
        } catch {}

        if (Date.now() - started >= timeoutMs) {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            finish(extractGenresFromDocument(doc));
          } catch {
            finish([]);
          }
          return;
        }

        setTimeout(poll, 500);
      };

      iframe.onload = () => {
        setTimeout(poll, 900);
      };

      try {
        iframe.src = url;
        setTimeout(poll, 1200);
      } catch {
        finish([]);
      }
    });
  }

  async function fetchJson(url) {
    try {
      const headers = {
        Accept: "application/json, text/plain, */*"
      };

      if (state.authToken) {
        headers.Authorization = state.authToken;
      }

      const response = await window.__CR_ORIGINAL_FETCH__(url, {
        credentials: "include",
        headers
      });

      if (!response.ok) return null;

      return await response.json();
    } catch {
      return null;
    }
  }

  async function fetchGenresFromApi(item) {
    const id = item.id;
    if (!id) return [];

    const endpoints = [
      `${CR_BASE_URL}/content/v2/cms/series/${id}?locale=${CR_LOCALE}`,
      `${CR_BASE_URL}/content/v2/cms/series/${id}?locale=${CR_LOCALE}&preferred_audio_language=pt-BR`,
      `${CR_BASE_URL}/content/v2/cms/objects/${id}?locale=${CR_LOCALE}`,
      `${CR_BASE_URL}/content/v2/cms/objects/${id}?locale=${CR_LOCALE}&preferred_audio_language=pt-BR`
    ];

    for (const endpoint of endpoints) {
      const json = await fetchJson(endpoint);
      if (!json) continue;

      state.rawResponses.push({
        url: endpoint,
        data: json,
        genreEnrich: true,
        time: new Date().toISOString()
      });

      const genres = extractGenresFromObject(json);
      if (genres.length) return genres;
    }

    return [];
  }

  function extractTitle(obj) {
    return clean(
      obj.title ||
        obj.series_title ||
        obj.name ||
        obj.slug_title ||
        obj.series_metadata?.title ||
        obj.movie_metadata?.title ||
        localizedText(obj.localized_title) ||
        ""
    );
  }

  function isBadSynopsis(value) {
    const raw = clean(value);
    const x = norm(raw);

    if (!raw) return true;
    if (raw.length < 35) return true;
    if (raw.length > 2500) return true;

    if (/^\d+(\.\d+)?$/.test(raw)) return true;
    if (/^\([\d.,]+[KM]?\)$/i.test(raw)) return true;

    const badSignals = [
      "leg | dub",
      "legendado",
      "dublado",
      "temporada",
      "temporadas",
      "episodio",
      "episodios",
      "episódio",
      "episódios",
      "audio",
      "subtitles",
      "classificacao",
      "classificação",
      "avaliacao",
      "avaliação"
    ];

    const count = badSignals.filter((signal) => x.includes(signal)).length;

    if (count >= 3 && raw.length < 700) return true;

    return false;
  }

  function normalizeSynopsis(title, value) {
    let text = clean(value);
    const t = clean(title);

    if (!text) return "";

    if (t && text.startsWith(t)) {
      text = clean(text.slice(t.length));
    }

    text = text.replace(/^\d+(\.\d+)?\s*\([\d.,]+[KM]?\)\s*/i, "");
    text = text.replace(/^["“”]+|["“”]+$/g, "");
    text = clean(text);

    return text;
  }

  function extractSynopsis(obj) {
    const candidates = [];

    const descFields = [
      obj.description,
      obj.long_description,
      obj.short_description,
      obj.synopsis,

      obj.series_metadata?.description,
      obj.series_metadata?.long_description,
      obj.series_metadata?.short_description,
      obj.series_metadata?.synopsis,

      obj.movie_metadata?.description,
      obj.movie_metadata?.long_description,
      obj.movie_metadata?.short_description,
      obj.movie_metadata?.synopsis,

      obj.metadata?.description,
      obj.metadata?.long_description,
      obj.metadata?.short_description,
      obj.metadata?.synopsis,

      obj.localized_description,
      obj.description_localized,
      obj.series_metadata?.localized_description,
      obj.movie_metadata?.localized_description,
      obj.panel?.description
    ];

    descFields.forEach((field) => {
      if (typeof field === "string" && field.length > 10) {
        candidates.push(field);
        return;
      }

      if (field && typeof field === "object") {
        const localized = localizedText(field);
        if (localized) candidates.push(localized);

        Object.values(field).forEach((val) => {
          const text = localizedText(val);
          if (text && text.length > 30) candidates.push(text);
        });
      }
    });

    const fromWalk = findFirstByKey(obj, [
      "description",
      "long_description",
      "synopsis",
      "short_description"
    ]);

    if (fromWalk) candidates.push(fromWalk);

    return clean(
      candidates
        .map((text) => normalizeSynopsis(extractTitle(obj), text))
        .filter((text) => !isBadSynopsis(text))
        .sort((a, b) => b.length - a.length)[0] || ""
    );
  }

  function extractSynopsisFromDOMImproved(box, fullText = "") {
    const candidates = [];

    const title =
      clean(
        box.querySelector("a[href*='/series/']")?.innerText ||
          box.querySelector("img")?.getAttribute("alt") ||
          ""
      ) || "";

    box
      .querySelectorAll(
        "p, [class*='description'], [class*='Description'], [class*='synopsis'], [class*='Synopsis'], div, span"
      )
      .forEach((el) => {
        const text = normalizeSynopsis(title, el.innerText || el.textContent);
        if (!isBadSynopsis(text)) candidates.push(text);
      });

    String(fullText || "")
      .split("\n")
      .map((line) => normalizeSynopsis(title, line))
      .forEach((line) => {
        if (!isBadSynopsis(line)) candidates.push(line);
      });

    return clean(
      candidates
        .filter(Boolean)
        .sort((a, b) => {
          const scoreA = (a.length > 90 && a.length < 900 ? 1000 : 0) + a.length;
          const scoreB = (b.length > 90 && b.length < 900 ? 1000 : 0) + b.length;
          return scoreB - scoreA;
        })[0] || ""
    );
  }

  function chooseBestSynopsis(oldItem, patch) {
    const oldSynopsis = normalizeSynopsis(oldItem.title || patch.title, oldItem.synopsis);
    const newSynopsis = normalizeSynopsis(patch.title || oldItem.title, patch.synopsis);

    if (!oldSynopsis && !isBadSynopsis(newSynopsis)) return newSynopsis;
    if (!newSynopsis || isBadSynopsis(newSynopsis)) return oldSynopsis;

    if (patch.sourceAPI) return newSynopsis;

    return newSynopsis.length > oldSynopsis.length ? newSynopsis : oldSynopsis;
  }

  function extractCopyright(obj) {
    return clean(
      obj.copyright ||
        obj.copyright_text ||
        obj.series_metadata?.copyright ||
        obj.movie_metadata?.copyright ||
        findFirstByKey(obj, ["copyright"])
    );
  }

  function extractMaturityInfo(obj) {
    let ageRating = clean(
      obj.age_rating ||
        obj.ageRating ||
        obj.content_rating ||
        obj.contentRating ||
        obj.maturity_rating ||
        obj.maturityRating ||
        obj.rating?.age_rating ||
        obj.series_metadata?.age_rating ||
        obj.series_metadata?.content_rating ||
        obj.series_metadata?.maturity_rating ||
        obj.movie_metadata?.age_rating ||
        obj.movie_metadata?.content_rating ||
        obj.movie_metadata?.maturity_rating ||
        ""
    );

    const descriptorCandidates = [
      obj.content_advisory,
      obj.contentAdvisory,
      obj.content_descriptors,
      obj.contentDescriptors,
      obj.maturity_ratings,
      obj.maturityRatings,
      obj.rating_guidance,
      obj.ratingGuidance,
      obj.advisory,
      obj.advisories,
      obj.series_metadata?.content_advisory,
      obj.series_metadata?.content_descriptors,
      obj.series_metadata?.maturity_ratings,
      obj.movie_metadata?.content_advisory,
      obj.movie_metadata?.content_descriptors,
      obj.movie_metadata?.maturity_ratings
    ];

    let descriptors = [];

    descriptorCandidates.forEach((value) => {
      if (!value) return;

      if (Array.isArray(value)) {
        value.forEach((entry) => {
          const text = localizedText(entry);
          if (text) descriptors.push(text);
        });
      } else if (typeof value === "object") {
        Object.values(value).forEach((entry) => {
          const text = localizedText(entry);
          if (text) descriptors.push(text);
        });
      } else {
        descriptors.push(value);
      }
    });

    descriptors.push(
      ...findStringsByKey(obj, [
        "content_advisory",
        "content_descriptors",
        "maturity_ratings",
        "rating_guidance",
        "advisory"
      ])
    );

    descriptors = unique(descriptors).filter((value) => {
      const valueNorm = norm(value);

      if (!valueNorm) return false;
      if (isPlainNumber(value)) return false;
      if (/^\d+(\.\d+)?$/.test(valueNorm)) return false;
      if (isReleaseSeason(value)) return false;

      return true;
    });

    if (!ageRating) {
      ageRating = descriptors.find(isAgeRating) || "";
    }

    const contentDescriptors = descriptors.filter((value) => {
      if (ageRating && norm(value) === norm(ageRating)) return false;
      if (isAgeRating(value)) return false;
      return true;
    });

    return {
      ageRating,
      contentRating: contentDescriptors.join(", "),
      contentDescriptors
    };
  }

  function extractCounts(obj) {
    const seasonCount =
      obj.season_count ||
      obj.series_metadata?.season_count ||
      obj.seasons_count ||
      "";

    const episodeCount =
      obj.episode_count ||
      obj.series_metadata?.episode_count ||
      obj.episodes_count ||
      "";

    return {
      seasonCount,
      episodeCount,
      seasons: seasonCount ? `${seasonCount} Temporadas` : "",
      episodes: episodeCount ? `${episodeCount} Episódios` : ""
    };
  }

  function parseCardText(text) {
    const lines = String(text || "")
      .split("\n")
      .map(clean)
      .filter(Boolean);

    return {
      availability:
        lines.find((line) => /leg\s*\|\s*dub/i.test(line)) ||
        lines.find((line) => /^legendado$/i.test(line)) ||
        lines.find((line) => /dub/i.test(line)) ||
        "",

      rating: lines.find((line) => /^\d(\.\d)?$/.test(line)) || "",
      votes: lines.find((line) => /^\([\d.,]+[KM]?\)$/i.test(line)) || "",
      seasons: lines.find((line) => /^\d+\s+temporadas?$/i.test(line)) || "",
      episodes:
        lines.find((line) => /^\d+[\d.,]*\s+epis[oó]dios?$/i.test(line)) ||
        "",

      synopsis:
        lines.find(
          (line) =>
            line.length > 80 &&
            !isBadSynopsis(line) &&
            !/leg\s*\|\s*dub|legendado/i.test(line)
        ) || ""
    };
  }

  function bestBox(a) {
    let element = a;
    let best = a;

    for (let i = 0; i < 9 && element; i++, element = element.parentElement) {
      const text = element.innerText || "";
      const bestText = best.innerText || "";

      if (text.length > bestText.length && text.length < 3500) {
        best = element;
      }
    }

    return best;
  }

  function scanDOM() {
    const anchors = [...document.querySelectorAll("a[href*='/series/']")];

    for (const a of anchors) {
      const url = a.href;
      const id = getIdFromUrl(url);
      if (!id) continue;

      const box = bestBox(a);
      const text = box.innerText || "";
      const parsed = parseCardText(text);
      const img = box.querySelector("img");
      const slug = getSlugFromUrl(url);

      const title = clean(
        a.innerText ||
          a.getAttribute("aria-label") ||
          img?.getAttribute("alt") ||
          text.split("\n")[0] ||
          ""
      );

      if (!title || title.length <= 2) continue;

      const genresFromDOM = extractGenresFromDOMImproved(box, text);
      const synopsisFromDOM = extractSynopsisFromDOMImproved(box, text);

      mergeItem(id, {
        id,
        title,
        slug,
        url,
        officialUrl: buildOfficialUrl({ id, slug, url }),

        cover: img?.currentSrc || img?.src || img?.getAttribute("src") || "",

        rating: parsed.rating,
        votes: parsed.votes,
        seasons: parsed.seasons,
        episodes: parsed.episodes,
        availability: parsed.availability,

        genres: genresFromDOM,
        synopsis: synopsisFromDOM || parsed.synopsis || "",

        sourceDOM: true,
        rawCardText: text
      });
    }

    updateGlobal();
  }

  function normalizeLocaleLabel(value) {
    const x = norm(value);

    if (
      x === "pt-br" ||
      x === "pt" ||
      x.includes("portugues (brasil)") ||
      x.includes("portuguese (brazil)")
    ) {
      return "Português (Brasil)";
    }

    if (x === "ja-jp" || x === "ja" || x.includes("japanese") || x.includes("japones")) {
      return "Japanese";
    }

    if (x === "en-us" || x === "en" || x.includes("english")) {
      return "English";
    }

    if (x === "es-419" || (x.includes("espanol") && x.includes("america"))) {
      return "Español (América Latina)";
    }

    if (x === "es-es" || (x.includes("espanol") && x.includes("espana"))) {
      return "Español (España)";
    }

    if (x === "fr-fr" || x === "fr" || x.includes("francais") || x.includes("french")) {
      return "Français";
    }

    if (x === "de-de" || x === "de" || x.includes("deutsch") || x.includes("german")) {
      return "Deutsch";
    }

    if (x === "it-it" || x === "it" || x.includes("italiano") || x.includes("italian")) {
      return "Italiano";
    }

    if (x === "ru-ru" || x === "ru" || x.includes("русски") || x.includes("russian")) {
      return "Русский";
    }

    if (x === "ar-sa" || x === "ar" || x.includes("العربية") || x.includes("arabic")) {
      return "العربية";
    }

    return clean(value);
  }

  function buildFlags(item) {
    const audioNorm = (item.audio || []).map(norm);
    const subtitlesNorm = (item.subtitles || []).map(norm);
    const genresNorm = (item.genres || []).map(norm);

    const ptBR = audioNorm.some(
      (x) =>
        x === "pt-br" ||
        x === "pt" ||
        x.includes("portugues (brasil)") ||
        x.includes("portuguese (brazil)")
    );

    const subtitlesPTBR = subtitlesNorm.some(
      (x) =>
        x === "pt-br" ||
        x === "pt" ||
        x.includes("portugues (brasil)") ||
        x.includes("portuguese (brazil)")
    );

    const onlyJapaneseAudio =
      audioNorm.length > 0 &&
      audioNorm.every(
        (x) => x === "japanese" || x === "ja-jp" || x === "japones"
      );

    const hasNonJapaneseAudio = audioNorm.some(
      (x) =>
        x &&
        x !== "japanese" &&
        x !== "ja-jp" &&
        x !== "japones"
    );

    const dub =
      audioNorm.length > 0
        ? ptBR || hasNonJapaneseAudio || (audioNorm.length > 1 && !onlyJapaneseAudio)
        : /dub/i.test(item.availability || "");

    const romance =
      genresNorm.some((x) => x.includes("romance")) ||
      norm(item.synopsis).includes("romance");

    return {
      dub,
      ptBR,
      subtitlesPTBR,
      romance,
      onlyJapaneseAudio
    };
  }

  function sanitizeGenres(values) {
    const out = new Set();

    (values || []).forEach((value) => {
      if (Array.isArray(value)) {
        value.forEach((v) => addGenre(out, v));
        return;
      }

      addGenre(out, value);
    });

    return unique([...out]);
  }

  function mergeItem(id, patch) {
    const old = state.byId.get(id) || {};

    const audio = unique(
      [...(old.audio || []), ...(patch.audio || [])]
        .filter((value) => !isBadLocaleValue(value))
        .map(normalizeLocaleLabel)
        .filter(Boolean)
    );

    const subtitles = unique(
      [...(old.subtitles || []), ...(patch.subtitles || [])]
        .filter((value) => !isBadLocaleValue(value))
        .map(normalizeLocaleLabel)
        .filter(Boolean)
    );

    const genres = sanitizeGenres([
      ...(old.genres || []),
      ...(patch.genres || [])
    ]);

    const contentDescriptors = unique([
      ...(old.contentDescriptors || []),
      ...(patch.contentDescriptors || [])
    ]).filter((value) => {
      if (isPlainNumber(value)) return false;
      if (isReleaseSeason(value)) return false;
      return true;
    });

    const images = unique([
      ...(old.images || []),
      ...(patch.images || []),
      patch.cover,
      old.cover
    ]).filter(Boolean);

    const slug = patch.slug || old.slug || "";
    const url = patch.url || old.url || "";
    const officialUrl =
      patch.officialUrl ||
      old.officialUrl ||
      buildOfficialUrl({ id, slug, url });

    const cover = patch.cover || old.cover || images[0] || "";

    const merged = {
      id,
      title: patch.title || old.title || "",
      slug,
      url: officialUrl || url,
      officialUrl,

      cover,
      image: cover,

      rating: getRatingValue(patch.rating || old.rating || ""),
      ratingRaw: patch.ratingRaw || old.ratingRaw || patch.rating || old.rating || "",
      votes: patch.votes || old.votes || "",
      seasons: patch.seasons || old.seasons || "",
      episodes: patch.episodes || old.episodes || "",
      seasonCount: patch.seasonCount || old.seasonCount || "",
      episodeCount: patch.episodeCount || old.episodeCount || "",

      availability: patch.availability || old.availability || "",

      audio,
      subtitles,

      ageRating: patch.ageRating || old.ageRating || "",
      contentRating: patch.contentRating || old.contentRating || "",
      contentDescriptors,

      genres,
      copyright: patch.copyright || old.copyright || "",
      synopsis: "",

      images,

      flags: {},

      sourceDOM: old.sourceDOM || patch.sourceDOM || false,
      sourceAPI: old.sourceAPI || patch.sourceAPI || false,
      sourceGenreAPI: old.sourceGenreAPI || patch.sourceGenreAPI || false,
      sourceGenreIframe: old.sourceGenreIframe || patch.sourceGenreIframe || false,

      rawCardText: patch.rawCardText || old.rawCardText || "",
      rawApi: patch.rawApi || old.rawApi || null
    };

    merged.synopsis = chooseBestSynopsis(old, patch);
    merged.flags = buildFlags(merged);

    state.byId.set(id, merged);

    return merged;
  }

  function getCandidateApiItems(data) {
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.data?.items)) return data.data.items;
    if (Array.isArray(data)) return data;
    return [];
  }

  function consumeApi(data, url) {
    const arr = getCandidateApiItems(data);
    if (!arr.length) return;

    state.requests.push({
      url,
      total: data.total ?? data?.data?.total ?? "",
      count: arr.length,
      time: new Date().toISOString()
    });

    state.rawResponses.push({ url, data });

    for (const obj of arr) {
      const id =
        obj.id ||
        obj.external_id ||
        obj.series_id ||
        obj.movie_id ||
        "";

      if (!id) continue;

      const images = extractImages(obj);
      const counts = extractCounts(obj);
      const maturity = extractMaturityInfo(obj);
      const slug = obj.slug_title || obj.slug || obj.series_metadata?.slug_title || "";
      const officialUrl = buildOfficialUrl({ id, slug, url: "" });

      mergeItem(id, {
        id,
        title: extractTitle(obj),
        slug,
        url: officialUrl,
        officialUrl,

        cover: images.cover,
        images: images.images,

        rating: obj.rating || obj.average_rating || obj.star_rating || "",
        ratingRaw: obj.rating || "",

        seasonCount: counts.seasonCount,
        episodeCount: counts.episodeCount,
        seasons: counts.seasons,
        episodes: counts.episodes,

        audio: extractAudio(obj),
        subtitles: extractSubtitles(obj),

        ageRating: maturity.ageRating,
        contentRating: maturity.contentRating,
        contentDescriptors: maturity.contentDescriptors,

        genres: extractGenres(obj),
        copyright: extractCopyright(obj),
        synopsis: extractSynopsis(obj),

        sourceAPI: true,
        rawApi: obj
      });
    }

    updateGlobal();
  }

  function toExportItem(item) {
    return {
      title: item.title,

      dub: item.flags.dub,
      ptBR: item.flags.ptBR,
      subtitlesPTBR: item.flags.subtitlesPTBR,

      audio: item.audio.join(", "),
      subtitles: item.subtitles.join(", "),
      genres: item.genres.join(", "),

      synopsis: item.synopsis,

      ageRating: item.ageRating,
      contentRating: item.contentRating,
      contentDescriptors: item.contentDescriptors,

      rating: item.rating,
      seasons: item.seasons,
      episodes: item.episodes,

      cover: item.cover,
      image: item.image,

      url: item.officialUrl || item.url,
      officialUrl: item.officialUrl || item.url,

      id: item.id,
      slug: item.slug,
      votes: item.votes,
      availability: item.availability,
      seasonCount: item.seasonCount,
      episodeCount: item.episodeCount,
      copyright: item.copyright,

      romance: item.flags.romance,
      onlyJapaneseAudio: item.flags.onlyJapaneseAudio,

      sourceDOM: item.sourceDOM,
      sourceAPI: item.sourceAPI,
      sourceGenreAPI: item.sourceGenreAPI,
      sourceGenreIframe: item.sourceGenreIframe
    };
  }

  function updateGlobal() {
    const arr = [...state.byId.values()]
      .filter((item) => item.title && item.id)
      .map((item) => {
        item.genres = sanitizeGenres(item.genres || []);
        item.flags = buildFlags(item);
        return item;
      })
      .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

    window.CR_CATALOG = arr;
    window.CR_EXPORT = arr.map(toExportItem);

    window.CR_SUMMARY = {
      total: arr.length,
      withApi: arr.filter((item) => item.sourceAPI).length,
      withUrl: arr.filter((item) => item.officialUrl || item.url).length,
      withCover: arr.filter((item) => item.cover).length,
      withGenres: arr.filter((item) => item.genres.length).length,
      withoutGenres: arr.filter((item) => !item.genres.length).length,
      withSynopsis: arr.filter((item) => item.synopsis).length,
      withAudio: arr.filter((item) => item.audio.length).length,
      withAgeRating: arr.filter((item) => item.ageRating).length,
      withContentRating: arr.filter(
        (item) => item.contentRating || item.contentDescriptors.length
      ).length,
      dub: arr.filter((item) => item.flags.dub).length,
      ptBR: arr.filter((item) => item.flags.ptBR).length,
      subtitlesPTBR: arr.filter((item) => item.flags.subtitlesPTBR).length,
      romance: arr.filter((item) => item.flags.romance).length,
      requests: state.requests.length
    };
  }

  function render() {
    updateGlobal();

    console.clear();
    console.log("🔥 CR_EXPORT atualizado");
    console.log(window.CR_SUMMARY);

    console.table(
      window.CR_EXPORT.map((item) => ({
        title: item.title,
        dub: item.dub,
        ptBR: item.ptBR,
        subtitlesPTBR: item.subtitlesPTBR,
        audio: item.audio,
        subtitles: item.subtitles,
        genres: item.genres,
        synopsis: item.synopsis
          ? item.synopsis.slice(0, 120) + (item.synopsis.length > 120 ? "..." : "")
          : "",
        ageRating: item.ageRating,
        contentRating: item.contentRating,
        rating: item.rating,
        seasons: item.seasons,
        episodes: item.episodes,
        cover: item.cover,
        url: item.url
      }))
    );
  }

  function scheduleRender() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(render, 250);
  }

  function getInternalItemByExport(exportItem) {
    return (
      window.CR_CATALOG.find((item) => item.id === exportItem.id) ||
      window.CR_CATALOG.find((item) => item.officialUrl === exportItem.officialUrl) ||
      window.CR_CATALOG.find((item) => item.url === exportItem.url) ||
      window.CR_CATALOG.find((item) => norm(item.title) === norm(exportItem.title)) ||
      null
    );
  }

  async function enrichOneGenre(exportItem, options = {}) {
    const internal = getInternalItemByExport(exportItem);
    if (!internal) return { title: exportItem.title, status: "not_found", genres: [] };

    if (internal.genres?.length) {
      return { title: internal.title, status: "already", genres: internal.genres };
    }

    let genres = [];

    if (internal.rawApi) {
      genres = extractGenresFromObject(internal.rawApi);
    }

    if (genres.length) {
      mergeItem(internal.id, {
        id: internal.id,
        title: internal.title,
        genres,
        sourceGenreAPI: true
      });

      return { title: internal.title, status: "rawApi", genres };
    }

    genres = await fetchGenresFromApi(internal);

    if (genres.length) {
      mergeItem(internal.id, {
        id: internal.id,
        title: internal.title,
        genres,
        sourceGenreAPI: true
      });

      return { title: internal.title, status: "api", genres };
    }

    const url = internal.officialUrl || internal.url || exportItem.officialUrl || exportItem.url || "";
    genres = await extractGenresFromIframe(url, options);

    if (genres.length) {
      mergeItem(internal.id, {
        id: internal.id,
        title: internal.title,
        genres,
        sourceGenreIframe: true
      });

      return { title: internal.title, status: "iframe", genres };
    }

    return { title: internal.title, status: "missing", genres: [] };
  }

  async function completeGenres(options = {}) {
    if (state.genreEnrichRunning) {
      console.warn("A correção de gêneros já está rodando.");
      return [];
    }

    state.genreEnrichRunning = true;

    try {
      updateGlobal();

      const concurrency = Number(options.concurrency || 1);
      const timeoutMs = Number(options.timeoutMs || 7000);
      const onlyMissing = options.onlyMissing !== false;

      const targets = window.CR_EXPORT.filter((item) => {
        if (!onlyMissing) return true;
        return !clean(item.genres);
      });

      const results = [];
      let index = 0;

      async function worker() {
        while (index < targets.length) {
          const item = targets[index++];
          const result = await enrichOneGenre(item, { timeoutMs });
          results.push(result);

          if (results.length % 20 === 0) {
            updateGlobal();
            console.log(`🎯 Gêneros: ${results.length}/${targets.length}`, genreSummary());
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(concurrency, targets.length) }, worker)
      );

      updateGlobal();
      render();

      console.log("✅ Correção de gêneros finalizada.");
      console.table(results.slice(0, 100));
      console.log(genreSummary());

      return results;
    } finally {
      state.genreEnrichRunning = false;
    }
  }

  function genreSummary() {
    updateGlobal();

    return {
      total: window.CR_EXPORT.length,
      withGenres: window.CR_EXPORT.filter((item) => clean(item.genres)).length,
      withoutGenres: window.CR_EXPORT.filter((item) => !clean(item.genres)).length
    };
  }

  function withoutGenres() {
    updateGlobal();

    return window.CR_EXPORT
      .filter((item) => !clean(item.genres))
      .map((item) => ({
        title: item.title,
        url: item.officialUrl || item.url
      }));
  }

  function copyText(text) {
    if (typeof window.copy === "function") {
      window.copy(text);
      return true;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();

    return true;
  }

  function downloadJson(filename = "cr_export.json") {
    updateGlobal();

    const blob = new Blob([JSON.stringify(window.CR_EXPORT, null, 2)], {
      type: "application/json;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);

    return `Arquivo gerado: ${filename}`;
  }

  const originalFetch = window.__CR_ORIGINAL_FETCH__ || window.fetch;
  window.__CR_ORIGINAL_FETCH__ = originalFetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = String(args[0]?.url || args[0] || "");

    if (isContentUrl(url)) {
      response
        .clone()
        .json()
        .then((data) => {
          consumeApi(data, url);
          scheduleRender();
        })
        .catch(() => {});
    }

    return response;
  };

  const originalOpen =
    window.__CR_ORIGINAL_XHR_OPEN__ || XMLHttpRequest.prototype.open;

  const originalSetHeader =
    window.__CR_ORIGINAL_XHR_SET_HEADER__ ||
    XMLHttpRequest.prototype.setRequestHeader;

  window.__CR_ORIGINAL_XHR_OPEN__ = originalOpen;
  window.__CR_ORIGINAL_XHR_SET_HEADER__ = originalSetHeader;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__cr_url = String(url || "");

    this.addEventListener("load", function () {
      if (isContentUrl(this.__cr_url)) {
        try {
          consumeApi(JSON.parse(this.responseText), this.__cr_url);
          scheduleRender();
        } catch {}
      }
    });

    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (String(name).toLowerCase() === "authorization") {
      state.authToken = value;
    }

    return originalSetHeader.apply(this, arguments);
  };

  state.observer = new MutationObserver(() => {
    scanDOM();
    scheduleRender();
  });

  state.observer.observe(document.body, { childList: true, subtree: true });

  window.CR_TOOL = {
    scan() {
      scanDOM();
      render();
      return window.CR_EXPORT;
    },

    async completeGenres(options = {}) {
      return completeGenres(options);
    },

    genreSummary() {
      return genreSummary();
    },

    withoutGenres() {
      return withoutGenres();
    },

    summary() {
      updateGlobal();
      return window.CR_SUMMARY;
    },

    full() {
      updateGlobal();
      return window.CR_EXPORT;
    },

    internal() {
      updateGlobal();
      return window.CR_CATALOG;
    },

    ptbr() {
      updateGlobal();
      return window.CR_EXPORT.filter((item) => item.ptBR);
    },

    dubbed() {
      updateGlobal();
      return window.CR_EXPORT.filter((item) => item.dub);
    },

    romance() {
      updateGlobal();
      return window.CR_EXPORT.filter((item) => item.romance);
    },

    withGenres() {
      updateGlobal();
      return window.CR_EXPORT.filter((item) => item.genres);
    },

    withSynopsis() {
      updateGlobal();
      return window.CR_EXPORT.filter((item) => item.synopsis);
    },

    inspect(titlePart) {
      updateGlobal();
      const query = norm(titlePart);
      return window.CR_EXPORT.filter((item) => norm(item.title).includes(query));
    },

    raw(titlePart) {
      updateGlobal();
      const query = norm(titlePart);
      return window.CR_CATALOG
        .filter((item) => norm(item.title).includes(query))
        .map((item) => item.rawApi);
    },

    requests() {
      return state.requests;
    },

    rawResponses() {
      return state.rawResponses;
    },

    copy() {
      updateGlobal();
      copyText(JSON.stringify(window.CR_EXPORT, null, 2));
      return "CR_EXPORT copiado para clipboard";
    },

    download(filename = "cr_export.json") {
      return downloadJson(filename);
    },

    stop() {
      clearTimeout(state.renderTimer);

      if (state.observer) {
        state.observer.disconnect();
      }

      if (state.genreFrame) {
        state.genreFrame.remove();
        state.genreFrame = null;
      }

      window.fetch = window.__CR_ORIGINAL_FETCH__;
      XMLHttpRequest.prototype.open = window.__CR_ORIGINAL_XHR_OPEN__;
      XMLHttpRequest.prototype.setRequestHeader =
        window.__CR_ORIGINAL_XHR_SET_HEADER__;

      console.log("🛑 CR_TOOL parado");
    }
  };

  scanDOM();
  render();

  console.log("✅ Ferramenta ativa em script único.");
  console.log("1) Role a página A-Z até o fim.");
  console.log("2) Depois rode: await CR_TOOL.completeGenres({ concurrency: 1, timeoutMs: 7000 })");
  console.log("3) Confira: CR_TOOL.genreSummary()");
  console.log("4) Copie: CR_TOOL.copy()");
})();