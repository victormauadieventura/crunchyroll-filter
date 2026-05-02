(() => {
  window.CR_TOOL?.stop?.();

  const CR_BASE_URL = "https://www.crunchyroll.com";

  const state = {
    byId: new Map(),
    requests: [],
    rawResponses: [],
    authToken: "",
    startedAt: new Date().toISOString()
  };

  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

  const norm = (value) =>
    clean(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const unique = (arr) =>
    [...new Set((arr || []).map(clean).filter(Boolean))];

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

  const isContentUrl = (url) => String(url).includes("/content/v2/");

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
              "code"
            ].forEach((key) => {
              if (typeof entry[key] === "string" || typeof entry[key] === "number") {
                out.push(entry[key]);
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
          "code"
        ].forEach((key) => {
          if (typeof value[key] === "string" || typeof value[key] === "number") {
            out.push(value[key]);
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
        if (version.original) out.push(version.original);
      });
    }

    return unique(out).filter((value) => !isPlainNumber(value));
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

    return unique(out).filter((value) => !isPlainNumber(value));
  }

  function extractGenres(obj) {
    const candidates = [];

    const direct =
      obj.genres ||
      obj.genre ||
      obj.categories ||
      obj.category ||
      obj.tags ||
      obj.series_metadata?.genres ||
      obj.movie_metadata?.genres ||
      obj.metadata?.genres ||
      obj.content_categories ||
      obj.tenant_categories ||
      [];

    if (Array.isArray(direct)) {
      direct.forEach((entry) => {
        if (typeof entry === "string") candidates.push(entry);
        if (entry?.title) candidates.push(entry.title);
        if (entry?.name) candidates.push(entry.name);
        if (entry?.label) candidates.push(entry.label);
        if (entry?.slug) candidates.push(entry.slug);
      });
    }

    candidates.push(
      ...findStringsByKey(obj, [
        "genres",
        "genre",
        "categories",
        "category",
        "tenant_categories",
        "content_categories"
      ])
    );

    return unique(candidates)
      .filter((value) => !/^series$/i.test(value))
      .filter((value) => !/^movie$/i.test(value))
      .filter((value) => !isPlainNumber(value))
      .filter((value) => !isAgeRating(value));
  }

  function extractTitle(obj) {
    return clean(
      obj.title ||
        obj.series_title ||
        obj.name ||
        obj.slug_title ||
        obj.series_metadata?.title ||
        obj.movie_metadata?.title ||
        obj.localized_title ||
        ""
    );
  }

  function extractSynopsis(obj) {
    return clean(
      obj.description ||
        obj.long_description ||
        obj.short_description ||
        obj.series_metadata?.description ||
        obj.movie_metadata?.description ||
        obj.metadata?.description ||
        findFirstByKey(obj, ["description", "synopsis"])
    );
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
          if (typeof entry === "string") descriptors.push(entry);
          if (entry?.title) descriptors.push(entry.title);
          if (entry?.name) descriptors.push(entry.name);
          if (entry?.label) descriptors.push(entry.label);
          if (entry?.description) descriptors.push(entry.description);
        });
      } else if (typeof value === "object") {
        Object.values(value).forEach((entry) => {
          if (typeof entry === "string") descriptors.push(entry);
          if (entry?.title) descriptors.push(entry.title);
          if (entry?.name) descriptors.push(entry.name);
          if (entry?.label) descriptors.push(entry.label);
          if (entry?.description) descriptors.push(entry.description);
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
            !/temporada|epis[oó]dio|leg\s*\|\s*dub|legendado/i.test(line)
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

      const title =
        clean(a.innerText) ||
        clean(a.getAttribute("aria-label")) ||
        clean(text.split("\n").find(Boolean)) ||
        "";

      if (!title || title.length <= 1) continue;

      mergeItem(id, {
        id,
        title,
        slug,
        url,
        officialUrl: buildOfficialUrl({ id, slug, url }),

        cover:
          img?.currentSrc ||
          img?.src ||
          img?.getAttribute("src") ||
          "",

        rating: parsed.rating,
        votes: parsed.votes,
        seasons: parsed.seasons,
        episodes: parsed.episodes,
        availability: parsed.availability,
        synopsis: parsed.synopsis,

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

    if (x === "ja-jp" || x.includes("japanese") || x.includes("japones")) {
      return "Japanese";
    }

    if (x === "en-us" || x.includes("english")) {
      return "English";
    }

    if (x === "es-419" || (x.includes("espanol") && x.includes("america"))) {
      return "Español (América Latina)";
    }

    if (x === "es-es" || (x.includes("espanol") && x.includes("espana"))) {
      return "Español (España)";
    }

    if (x === "fr-fr" || x.includes("francais") || x.includes("french")) {
      return "Français";
    }

    if (x === "de-de" || x.includes("deutsch") || x.includes("german")) {
      return "Deutsch";
    }

    if (x === "it-it" || x.includes("italiano") || x.includes("italian")) {
      return "Italiano";
    }

    if (x === "ru-ru" || x.includes("русски") || x.includes("russian")) {
      return "Русский";
    }

    if (x === "ar-sa" || x.includes("العربية") || x.includes("arabic")) {
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

  function mergeItem(id, patch) {
    const old = state.byId.get(id) || {};

    const audio = unique([...(old.audio || []), ...(patch.audio || [])])
      .filter((value) => !isPlainNumber(value))
      .map(normalizeLocaleLabel);

    const subtitles = unique([
      ...(old.subtitles || []),
      ...(patch.subtitles || [])
    ])
      .filter((value) => !isPlainNumber(value))
      .map(normalizeLocaleLabel);

    const genres = unique([...(old.genres || []), ...(patch.genres || [])])
      .filter((value) => !isPlainNumber(value))
      .filter((value) => !isAgeRating(value));

    const contentDescriptors = unique([
      ...(old.contentDescriptors || []),
      ...(patch.contentDescriptors || [])
    ]).filter((value) => !isPlainNumber(value));

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
      synopsis: patch.synopsis || old.synopsis || "",

      images,

      flags: {},

      sourceDOM: old.sourceDOM || patch.sourceDOM || false,
      sourceAPI: old.sourceAPI || patch.sourceAPI || false,

      rawCardText: patch.rawCardText || old.rawCardText || "",
      rawApi: patch.rawApi || old.rawApi || null
    };

    merged.flags = buildFlags(merged);

    state.byId.set(id, merged);
  }

  function consumeApi(data, url) {
    const arr = Array.isArray(data?.data) ? data.data : [];
    if (!arr.length) return;

    state.requests.push({
      url,
      total: data.total,
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
      const slug = obj.slug_title || obj.slug || "";
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
      synopsis: item.synopsis,

      romance: item.flags.romance,
      onlyJapaneseAudio: item.flags.onlyJapaneseAudio,

      sourceDOM: item.sourceDOM,
      sourceAPI: item.sourceAPI
    };
  }

  function updateGlobal() {
    const arr = [...state.byId.values()]
      .filter((item) => item.title && item.id)
      .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

    window.CR_CATALOG = arr;
    window.CR_EXPORT = arr.map(toExportItem);

    window.CR_SUMMARY = {
      total: arr.length,
      withApi: arr.filter((item) => item.sourceAPI).length,
      withUrl: arr.filter((item) => item.officialUrl || item.url).length,
      withCover: arr.filter((item) => item.cover).length,
      withGenres: arr.filter((item) => item.genres.length).length,
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
          render();
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
          render();
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

  const observer = new MutationObserver(() => {
    scanDOM();
    render();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.CR_TOOL = {
    scan() {
      scanDOM();
      render();
      return window.CR_EXPORT;
    },

    summary() {
      updateGlobal();
      return window.CR_SUMMARY;
    },

    full() {
      return window.CR_EXPORT;
    },

    internal() {
      return window.CR_CATALOG;
    },

    ptbr() {
      return window.CR_EXPORT.filter((item) => item.ptBR);
    },

    dubbed() {
      return window.CR_EXPORT.filter((item) => item.dub);
    },

    romance() {
      return window.CR_EXPORT.filter((item) => item.romance);
    },

    inspect(titlePart) {
      const query = norm(titlePart);
      return window.CR_EXPORT.filter((item) => norm(item.title).includes(query));
    },

    raw(titlePart) {
      const query = norm(titlePart);
      return window.CR_CATALOG
        .filter((item) => norm(item.title).includes(query))
        .map((item) => item.rawApi);
    },

    copy() {
      copy(JSON.stringify(window.CR_EXPORT, null, 2));
      return "CR_EXPORT copiado para clipboard";
    },

    copyInternal() {
      copy(JSON.stringify(window.CR_CATALOG, null, 2));
      return "CR_CATALOG interno copiado para clipboard";
    },

    stop() {
      observer.disconnect();
      window.fetch = window.__CR_ORIGINAL_FETCH__;
      XMLHttpRequest.prototype.open = window.__CR_ORIGINAL_XHR_OPEN__;
      XMLHttpRequest.prototype.setRequestHeader =
        window.__CR_ORIGINAL_XHR_SET_HEADER__;
      console.log("🛑 CR_TOOL parado");
    }
  };

  scanDOM();
  render();

  console.log("✅ Ferramenta ativa.");
  console.log("Role a página A-Z até o fim. O array final fica em window.CR_EXPORT.");
  console.log("Depois rode: CR_TOOL.summary() ou CR_TOOL.copy()");
})();