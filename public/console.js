(() => {
  window.CR_TOOL?.stop?.();

  const state = {
    byId: new Map(),
    requests: [],
    rawResponses: [],
    authToken: "",
    startedAt: new Date().toISOString()
  };

  const clean = v => String(v ?? "").replace(/\s+/g, " ").trim();

  const norm = v =>
    clean(v)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const unique = arr =>
    [...new Set((arr || []).map(clean).filter(Boolean))];

  const getIdFromUrl = url =>
    String(url).match(/\/series\/([^/?#]+)/)?.[1] || "";

  const getSlugFromUrl = url =>
    String(url).match(/\/series\/[^/]+\/([^/?#]+)/)?.[1] || "";

  const isContentUrl = url =>
    String(url).includes("/content/v2/");

  function walk(obj, visitor, path = []) {
    if (obj == null) return;

    visitor(obj, path);

    if (Array.isArray(obj)) {
      obj.forEach((v, i) => walk(v, visitor, [...path, i]));
      return;
    }

    if (typeof obj === "object") {
      Object.entries(obj).forEach(([k, v]) => walk(v, visitor, [...path, k]));
    }
  }

  function findStringsByKey(obj, keyPatterns) {
    const out = [];

    walk(obj, (value, path) => {
      const key = String(path[path.length - 1] || "");
      const keyNorm = norm(key);

      const keyMatches = keyPatterns.some(p => keyNorm.includes(norm(p)));

      if (!keyMatches) return;

      if (typeof value === "string") {
        out.push(value);
      }

      if (Array.isArray(value)) {
        value.forEach(v => {
          if (typeof v === "string") out.push(v);
          if (v && typeof v === "object") {
            if (typeof v.title === "string") out.push(v.title);
            if (typeof v.name === "string") out.push(v.name);
            if (typeof v.locale === "string") out.push(v.locale);
            if (typeof v.audio_locale === "string") out.push(v.audio_locale);
            if (typeof v.subtitle_locale === "string") out.push(v.subtitle_locale);
          }
        });
      }
    });

    return unique(out);
  }

  function findFirstByKey(obj, keyPatterns) {
    const values = findStringsByKey(obj, keyPatterns);
    return values[0] || "";
  }

  function extractImages(obj) {
    const urls = [];

    walk(obj, value => {
      if (typeof value === "string" && value.includes("imgsrv.crunchyroll.com")) {
        urls.push(value);
      }
    });

    const posterTall =
      urls.find(u => /poster/i.test(u) && /tall/i.test(u)) ||
      urls.find(u => /poster/i.test(u)) ||
      urls.find(u => /catalog\/crunchyroll/i.test(u)) ||
      urls[0] ||
      "";

    return {
      cover: posterTall,
      images: unique(urls)
    };
  }

  function extractAudio(obj) {
    const out = [];

    out.push(...findStringsByKey(obj, [
      "audio_locale",
      "audio_locales",
      "available_audio_locales",
      "audio_language",
      "audio"
    ]));

    if (Array.isArray(obj?.versions)) {
      obj.versions.forEach(v => {
        if (v.audio_locale) out.push(v.audio_locale);
        if (v.audio_language) out.push(v.audio_language);
        if (v.media_locale) out.push(v.media_locale);
        if (v.original) out.push(v.original);
      });
    }

    return unique(out);
  }

  function extractSubtitles(obj) {
    const out = [];

    out.push(...findStringsByKey(obj, [
      "subtitle_locale",
      "subtitle_locales",
      "available_subtitle_locales",
      "subtitle_language",
      "subtitles"
    ]));

    if (Array.isArray(obj?.versions)) {
      obj.versions.forEach(v => {
        if (v.subtitle_locale) out.push(v.subtitle_locale);
        if (Array.isArray(v.subtitle_locales)) out.push(...v.subtitle_locales);
      });
    }

    return unique(out);
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
      direct.forEach(v => {
        if (typeof v === "string") candidates.push(v);
        if (v?.title) candidates.push(v.title);
        if (v?.name) candidates.push(v.name);
        if (v?.label) candidates.push(v.label);
        if (v?.slug) candidates.push(v.slug);
      });
    }

    candidates.push(...findStringsByKey(obj, [
      "genres",
      "genre",
      "categories",
      "category",
      "tenant_categories",
      "content_categories"
    ]));

    return unique(candidates)
      .filter(x => !/^series$/i.test(x))
      .filter(x => !/^movie$/i.test(x))
      .filter(x => !/^\d+$/.test(x));
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

  function extractContentRating(obj) {
    return clean(
      obj.content_advisory ||
      obj.content_rating ||
      obj.maturity_rating ||
      obj.maturity_ratings?.join?.(", ") ||
      obj.series_metadata?.maturity_rating ||
      obj.movie_metadata?.maturity_rating ||
      findFirstByKey(obj, ["content_advisory", "content_rating", "maturity"])
    );
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
    const lines = String(text || "").split("\n").map(clean).filter(Boolean);

    return {
      availability:
        lines.find(x => /leg\s*\|\s*dub/i.test(x)) ||
        lines.find(x => /^legendado$/i.test(x)) ||
        lines.find(x => /dub/i.test(x)) ||
        "",

      rating: lines.find(x => /^\d(\.\d)?$/.test(x)) || "",
      votes: lines.find(x => /^\([\d.,]+[KM]?\)$/i.test(x)) || "",
      seasons: lines.find(x => /temporada/i.test(x)) || "",
      episodes: lines.find(x => /epis[oó]dio/i.test(x)) || "",

      synopsis:
        lines.find(x =>
          x.length > 80 &&
          !/temporada|epis[oó]dio|leg\s*\|\s*dub|legendado/i.test(x)
        ) || ""
    };
  }

  function bestBox(a) {
    let el = a;
    let best = a;

    for (let i = 0; i < 9 && el; i++, el = el.parentElement) {
      const t = el.innerText || "";
      const bt = best.innerText || "";

      if (t.length > bt.length && t.length < 3500) best = el;
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

      const title =
        clean(a.innerText) ||
        clean(a.getAttribute("aria-label")) ||
        clean(text.split("\n").find(Boolean)) ||
        "";

      if (!title || title.length <= 1) continue;

      mergeItem(id, {
        id,
        title,
        slug: getSlugFromUrl(url),
        url,
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

  function normalizeLocaleLabel(v) {
    const x = norm(v);

    if (x === "pt-br" || x.includes("portugues (brasil)") || x.includes("portuguese (brazil)")) {
      return "Português (Brasil)";
    }

    if (x === "ja-jp" || x.includes("japanese") || x.includes("japones")) {
      return "Japanese";
    }

    if (x === "en-us" || x.includes("english")) {
      return "English";
    }

    if (x.includes("espanol") && x.includes("america")) {
      return "Español (América Latina)";
    }

    if (x.includes("espanol") && x.includes("espana")) {
      return "Español (España)";
    }

    if (x.includes("francais") || x.includes("french")) {
      return "Français";
    }

    if (x.includes("deutsch") || x.includes("german")) {
      return "Deutsch";
    }

    if (x.includes("italiano") || x.includes("italian")) {
      return "Italiano";
    }

    if (x.includes("русски") || x.includes("russian")) {
      return "Русский";
    }

    if (x.includes("العربية") || x.includes("arabic")) {
      return "العربية";
    }

    return clean(v);
  }

  function buildFlags(item) {
    const audioNorm = (item.audio || []).map(norm);
    const subtitlesNorm = (item.subtitles || []).map(norm);
    const genresNorm = (item.genres || []).map(norm);

    const ptBR =
      audioNorm.some(x =>
        x === "pt-br" ||
        x.includes("portugues (brasil)") ||
        x.includes("portuguese (brazil)")
      );

    const subtitlesPTBR =
      subtitlesNorm.some(x =>
        x === "pt-br" ||
        x.includes("portugues (brasil)") ||
        x.includes("portuguese (brazil)")
      );

    const dub =
      /dub/i.test(item.availability || "") ||
      (item.audio || []).length > 1 ||
      (item.audio || []).some(x => norm(x) !== "ja-jp");

    const romance =
      genresNorm.some(x => x.includes("romance")) ||
      norm(item.synopsis).includes("romance");

    return { dub, ptBR, subtitlesPTBR, romance };
  }

  function mergeItem(id, patch) {
    const old = state.byId.get(id) || {};

    const audio = unique([
      ...(old.audio || []),
      ...(patch.audio || [])
    ]).map(normalizeLocaleLabel);

    const subtitles = unique([
      ...(old.subtitles || []),
      ...(patch.subtitles || [])
    ]).map(normalizeLocaleLabel);

    const genres = unique([
      ...(old.genres || []),
      ...(patch.genres || [])
    ]);

    const images = unique([
      ...(old.images || []),
      ...(patch.images || []),
      patch.cover,
      old.cover
    ]).filter(Boolean);

    const merged = {
      id,
      title: patch.title || old.title || "",
      slug: patch.slug || old.slug || "",
      url: patch.url || old.url || "",
      cover: patch.cover || old.cover || images[0] || "",

      rating: patch.rating || old.rating || "",
      votes: patch.votes || old.votes || "",
      seasons: patch.seasons || old.seasons || "",
      episodes: patch.episodes || old.episodes || "",
      seasonCount: patch.seasonCount || old.seasonCount || "",
      episodeCount: patch.episodeCount || old.episodeCount || "",

      availability: patch.availability || old.availability || "",

      audio,
      subtitles,
      contentRating: patch.contentRating || old.contentRating || "",
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

      mergeItem(id, {
        id,
        title: extractTitle(obj),
        slug: obj.slug_title || obj.slug || "",
        url: obj.slug_title
          ? `https://www.crunchyroll.com/pt-br/series/${id}/${obj.slug_title}`
          : "",

        cover: images.cover,
        images: images.images,

        rating:
          obj.rating ||
          obj.average_rating ||
          obj.star_rating ||
          "",

        seasonCount: counts.seasonCount,
        episodeCount: counts.episodeCount,
        seasons: counts.seasons,
        episodes: counts.episodes,

        audio: extractAudio(obj),
        subtitles: extractSubtitles(obj),
        contentRating: extractContentRating(obj),
        genres: extractGenres(obj),
        copyright: extractCopyright(obj),
        synopsis: extractSynopsis(obj),

        sourceAPI: true,
        rawApi: obj
      });
    }

    updateGlobal();
  }

  function updateGlobal() {
    const arr = [...state.byId.values()]
      .filter(x => x.title && x.id)
      .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

    window.CR_CATALOG = arr;

    window.CR_SUMMARY = {
      total: arr.length,
      withApi: arr.filter(x => x.sourceAPI).length,
      withGenres: arr.filter(x => x.genres.length).length,
      withAudio: arr.filter(x => x.audio.length).length,
      dub: arr.filter(x => x.flags.dub).length,
      ptBR: arr.filter(x => x.flags.ptBR).length,
      subtitlesPTBR: arr.filter(x => x.flags.subtitlesPTBR).length,
      romance: arr.filter(x => x.flags.romance).length,
      requests: state.requests.length
    };
  }

  function render() {
    updateGlobal();

    console.clear();
    console.log("🔥 CR_CATALOG atualizado");
    console.log(window.CR_SUMMARY);

    console.table(window.CR_CATALOG.map(x => ({
      title: x.title,
      dub: x.flags.dub,
      ptBR: x.flags.ptBR,
      subtitlesPTBR: x.flags.subtitlesPTBR,
      audio: x.audio.join(", "),
      subtitles: x.subtitles.join(", "),
      genres: x.genres.join(", "),
      rating: x.rating,
      seasons: x.seasons,
      episodes: x.episodes,
      cover: x.cover
    })));
  }

  const originalFetch = window.__CR_ORIGINAL_FETCH__ || window.fetch;
  window.__CR_ORIGINAL_FETCH__ = originalFetch;

  window.fetch = async function (...args) {
    const res = await originalFetch.apply(this, args);
    const url = String(args[0]?.url || args[0] || "");

    if (isContentUrl(url)) {
      res.clone().json().then(data => {
        consumeApi(data, url);
        render();
      }).catch(() => {});
    }

    return res;
  };

  const originalOpen = window.__CR_ORIGINAL_XHR_OPEN__ || XMLHttpRequest.prototype.open;
  const originalSetHeader = window.__CR_ORIGINAL_XHR_SET_HEADER__ || XMLHttpRequest.prototype.setRequestHeader;

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
      return window.CR_CATALOG;
    },

    summary() {
      updateGlobal();
      return window.CR_SUMMARY;
    },

    full() {
      return window.CR_CATALOG;
    },

    ptbr() {
      return window.CR_CATALOG.filter(x => x.flags.ptBR);
    },

    dubbed() {
      return window.CR_CATALOG.filter(x => x.flags.dub);
    },

    romance() {
      return window.CR_CATALOG.filter(x => x.flags.romance);
    },

    inspect(titlePart) {
      const q = norm(titlePart);
      return window.CR_CATALOG.filter(x => norm(x.title).includes(q));
    },

    raw(titlePart) {
      return this.inspect(titlePart).map(x => x.rawApi);
    },

    copy() {
      copy(JSON.stringify(window.CR_CATALOG, null, 2));
      return "Copiado para clipboard";
    },

    stop() {
      observer.disconnect();
      window.fetch = window.__CR_ORIGINAL_FETCH__;
      XMLHttpRequest.prototype.open = window.__CR_ORIGINAL_XHR_OPEN__;
      XMLHttpRequest.prototype.setRequestHeader = window.__CR_ORIGINAL_XHR_SET_HEADER__;
      console.log("🛑 CR_TOOL parado");
    }
  };

  scanDOM();
  render();

  console.log("✅ Ferramenta ativa.");
  console.log("Agora role a página A-Z até o fim. O array fica em window.CR_CATALOG.");
  console.log("Depois rode: CR_TOOL.summary() ou CR_TOOL.copy()");
})();