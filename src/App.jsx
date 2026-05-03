import { useEffect, useMemo, useRef, useState } from "react";

const CATALOG_URL = import.meta.env.BASE_URL + "catalogo_crunchyroll_full.json";

const normalize = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const splitList = (value) => {
  if (Array.isArray(value)) return value.flatMap(splitList).filter(Boolean);
  if (!value) return [];

  return String(value)
    .split(/,|•|\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^\d+$/.test(item));
};

const unique = (list) => [
  ...new Set(list.map((item) => String(item).trim()).filter(Boolean)),
];

const hasPtBr = (values) =>
  splitList(values).some((item) => {
    const text = normalize(item);
    return (
      text === "pt-br" ||
      text === "pt" ||
      text.includes("portugues brasil") ||
      text.includes("portugues (brasil)") ||
      text.includes("portuguese brazil") ||
      text.includes("portuguese (brazil)")
    );
  });

const isJapanese = (value) => {
  const text = normalize(value);
  return text === "japanese" || text === "ja-jp" || text === "japones";
};

const navClass = (active) =>
  `shrink-0 rounded-full px-3 py-2 text-sm font-bold transition ${
    active
      ? "bg-white text-black"
      : "bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
  }`;

const getRatingValue = (value) => {
  if (!value) return "";
  if (typeof value === "object") {
    return String(value.average ?? value.rating ?? "");
  }
  return String(value);
};

const toNumber = (value) => {
  const n = Number(getRatingValue(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const cleanCoverUrl = (url = "") => {
  let value = String(url || "").trim();
  if (!value) return "";

  value = value.replace(/,?blur=\d+/g, "");
  value = value.replace(/width=\d+/g, "width=640");
  value = value.replace(/height=\d+/g, "height=960");
  value = value.replace(/quality=\d+/g, "quality=95");

  return value;
};

const getTitle = (item = {}) =>
  String(item.title || item.name || "Untitled").trim();

const getUrl = (item = {}) =>
  String(item.officialUrl || item.url || item.href || "").trim();

const getCover = (item = {}) =>
  cleanCoverUrl(item.cover || item.image || item.poster || "");

const normalizeItem = (input) => {
  const item = input && typeof input === "object" ? input : {};

  const audio = unique(splitList(item.audio));
  const subtitles = unique(splitList(item.subtitles));
  const genres = unique(splitList(item.genres));
  const contentDescriptors = unique(
    splitList(item.contentDescriptors || item.contentRating),
  );

  const contentRating = String(item.contentRating || "").trim();
  const ageRating = String(item.ageRating || "").trim();
  const rating = getRatingValue(item.rating);
  const url = getUrl(item);
  const title = getTitle(item);
  const synopsis = String(
    item.synopsis || item.description || item.summary || "",
  ).trim();

  const ptBR = Boolean(item.ptBR || item.flags?.ptBR || hasPtBr(audio));
  const subtitlesPTBR = Boolean(
    item.subtitlesPTBR || item.flags?.subtitlesPTBR || hasPtBr(subtitles),
  );

  const onlyJapaneseAudio =
    audio.length > 0 && audio.every((language) => isJapanese(language));

  const hasNonJapaneseAudio =
    audio.length > 0 && audio.some((language) => !isJapanese(language));

  const dub =
    audio.length > 0
      ? ptBR || hasNonJapaneseAudio || (audio.length > 1 && !onlyJapaneseAudio)
      : Boolean(item.dub || item.flags?.dub);

  const romance =
    Boolean(item.romance || item.flags?.romance) ||
    genres.some((genre) => normalize(genre).includes("romance")) ||
    normalize(synopsis).includes("romance");

  return {
    ...item,
    id: String(item.id || url || title),
    title,
    url,
    officialUrl: url,
    cover: getCover(item),
    rating,
    ratingNumber: toNumber(rating),
    seasons: String(item.seasons || "").trim(),
    episodes: String(item.episodes || "").trim(),
    seasonCount: item.seasonCount || "",
    episodeCount: item.episodeCount || "",
    audio,
    subtitles,
    genres,
    ageRating,
    contentRating,
    contentDescriptors,
    synopsis,
    flags: { dub, ptBR, subtitlesPTBR, romance, onlyJapaneseAudio },
  };
};

const ageSortOrder = {
  Livre: 0,
  L: 0,
  AL: 0,
  A10: 10,
  A12: 12,
  A14: 14,
  A16: 16,
  A18: 18,
};

export default function App() {
  const [rawItems, setRawItems] = useState([]);
  const [query, setQuery] = useState("");
  const [audioMode, setAudioMode] = useState("all");
  const [subtitleMode, setSubtitleMode] = useState("all");
  const [dubMode, setDubMode] = useState("all");
  const [genre, setGenre] = useState("all");
  const [ageRating, setAgeRating] = useState("all");
  const [contentFlag, setContentFlag] = useState("all");
  const [minRating, setMinRating] = useState("0");
  const [sortBy, setSortBy] = useState("rating-desc");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState("home");
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError("");

    fetch(CATALOG_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const list = Array.isArray(json) ? json : json.items;

        if (!Array.isArray(list)) {
          throw new Error(
            "Invalid JSON: expected an array or an object with items.",
          );
        }

        setRawItems(list);
      })
      .catch((err) => {
        console.error(err);
        setError(
          `Could not load ${CATALOG_URL}. Check if the file exists inside /public.`,
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.body.style.overflow =
      showFilters || selected || showMobileMenu || showMobileSearch
        ? "hidden"
        : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [showFilters, selected, showMobileMenu, showMobileSearch]);

  const items = useMemo(
    () =>
      rawItems
        .filter(Boolean)
        .map(normalizeItem)
        .filter((item) => item.title && item.title !== "Untitled"),
    [rawItems],
  );

  const allGenres = useMemo(() => {
    const set = new Set();
    items.forEach((item) => item.genres.forEach((value) => set.add(value)));
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const allAgeRatings = useMemo(() => {
    const set = new Set();
    items.forEach((item) => item.ageRating && set.add(item.ageRating));

    return [...set].sort(
      (a, b) =>
        (ageSortOrder[a] ?? 999) - (ageSortOrder[b] ?? 999) ||
        a.localeCompare(b),
    );
  }, [items]);

  const allContentFlags = useMemo(() => {
    const set = new Set();
    items.forEach((item) =>
      item.contentDescriptors.forEach((value) => set.add(value)),
    );
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const filtered = useMemo(() => {
    const q = normalize(query);

    const result = items.filter((item) => {
      const searchableText = normalize(
        [
          item.title,
          item.synopsis,
          item.audio.join(" "),
          item.subtitles.join(" "),
          item.genres.join(" "),
          item.ageRating,
          item.contentRating,
          item.contentDescriptors.join(" "),
        ].join(" "),
      );

      if (q && !searchableText.includes(q)) return false;
      if (audioMode === "ptbr" && !item.flags.ptBR) return false;
      if (audioMode === "no-ptbr" && item.flags.ptBR) return false;
      if (subtitleMode === "ptbr" && !item.flags.subtitlesPTBR) return false;
      if (subtitleMode === "no-ptbr" && item.flags.subtitlesPTBR) return false;
      if (dubMode === "dub" && !item.flags.dub) return false;
      if (dubMode === "sub-only" && item.flags.dub) return false;
      if (dubMode === "japanese-only" && !item.flags.onlyJapaneseAudio) {
        return false;
      }

      if (
        genre !== "all" &&
        !item.genres.some((value) => normalize(value) === normalize(genre))
      ) {
        return false;
      }

      if (ageRating !== "all" && item.ageRating !== ageRating) return false;

      if (
        contentFlag !== "all" &&
        !item.contentDescriptors.some(
          (value) => normalize(value) === normalize(contentFlag),
        )
      ) {
        return false;
      }

      if (item.ratingNumber < Number(minRating)) return false;

      return true;
    });

    result.sort((a, b) => {
      if (sortBy === "title-asc") {
        return a.title.localeCompare(b.title, "pt-BR");
      }

      if (sortBy === "title-desc") {
        return b.title.localeCompare(a.title, "pt-BR");
      }

      if (sortBy === "rating-desc") {
        return (
          b.ratingNumber - a.ratingNumber ||
          a.title.localeCompare(b.title, "pt-BR")
        );
      }

      if (sortBy === "rating-asc") {
        return (
          a.ratingNumber - b.ratingNumber ||
          a.title.localeCompare(b.title, "pt-BR")
        );
      }

      if (sortBy === "age-asc") {
        return (
          (ageSortOrder[a.ageRating] ?? 999) -
          (ageSortOrder[b.ageRating] ?? 999)
        );
      }

      if (sortBy === "age-desc") {
        return (
          (ageSortOrder[b.ageRating] ?? -1) - (ageSortOrder[a.ageRating] ?? -1)
        );
      }

      return 0;
    });

    return result;
  }, [
    items,
    query,
    audioMode,
    subtitleMode,
    dubMode,
    genre,
    ageRating,
    contentFlag,
    minRating,
    sortBy,
  ]);

  const pageFiltered = useMemo(() => {
    let base = filtered;

    if (page === "dub") {
      base = base.filter((item) => item.flags.dub || item.flags.ptBR);
    }

    if (page === "sub") {
      base = base.filter((item) => item.flags.subtitlesPTBR);
    }

    return base;
  }, [filtered, page]);

  const stats = useMemo(
    () => ({
      total: items.length,
      filtered: pageFiltered.length,
      dub: items.filter((item) => item.flags.dub).length,
      ptBR: items.filter((item) => item.flags.ptBR).length,
      subtitlesPTBR: items.filter((item) => item.flags.subtitlesPTBR).length,
      withSynopsis: items.filter((item) => item.synopsis).length,
    }),
    [items, pageFiltered],
  );

  const hero = useMemo(() => {
    const candidates = pageFiltered.filter((item) => item.cover && item.synopsis);
    return (
      candidates[0] ||
      pageFiltered.find((item) => item.cover) ||
      pageFiltered[0] ||
      null
    );
  }, [pageFiltered]);

  const rows = useMemo(() => {
    const base = pageFiltered.filter((item) => item.id !== hero?.id);
    const only = (fn) => base.filter(fn).slice(0, 24);

    return [
      { title: "Em destaque", items: base.slice(0, 24) },
      {
        title: "Dublado ou com áudio PT-BR",
        items: only((item) => item.flags.dub || item.flags.ptBR),
      },
      {
        title: "Legendas em português",
        items: only((item) => item.flags.subtitlesPTBR),
      },
      {
        title: "Melhores avaliações",
        items: [...base]
          .sort((a, b) => b.ratingNumber - a.ratingNumber)
          .slice(0, 24),
      },
    ].filter((row) => row.items.length);
  }, [pageFiltered, hero]);

  const hasActiveFilters =
    page !== "home" ||
    Boolean(query.trim()) ||
    audioMode !== "all" ||
    subtitleMode !== "all" ||
    dubMode !== "all" ||
    genre !== "all" ||
    ageRating !== "all" ||
    contentFlag !== "all" ||
    minRating !== "0" ||
    sortBy !== "rating-desc";

  const resetFilters = () => {
    setQuery("");
    setAudioMode("all");
    setSubtitleMode("all");
    setDubMode("all");
    setGenre("all");
    setAgeRating("all");
    setContentFlag("all");
    setMinRating("0");
    setSortBy("rating-desc");
  };

  if (loading) return <LoadingScreen />;

  return (
    <main className="min-h-screen bg-[#050505] text-white selection:bg-red-600/70">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-black/80 px-3 py-3 backdrop-blur-xl md:px-8">
        <div className="mx-auto max-w-[1800px]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage("home")}
              className="shrink-0 text-2xl font-black tracking-tighter text-red-600 md:text-3xl"
            >
              CRFLIX
            </button>

            <nav className="hidden items-center gap-2 text-sm font-semibold md:flex">
              <button
                onClick={() => setPage("home")}
                className={navClass(page === "home")}
              >
                Início
              </button>

              <button
                onClick={() => setPage("catalog")}
                className={navClass(page === "catalog")}
              >
                Catálogo
              </button>

              <button
                onClick={() => setPage("dub")}
                className={navClass(page === "dub")}
              >
                Dublados
              </button>

              <button
                onClick={() => setPage("sub")}
                className={navClass(page === "sub")}
              >
                Legendas PT-BR
              </button>
            </nav>

            <div className="ml-auto hidden items-center justify-end gap-3 md:flex">
              <div className="relative w-[360px] lg:w-[420px]">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar título, gênero, áudio..."
                  className="w-full rounded-full border border-white/10 bg-black/50 px-5 py-3 text-sm text-white outline-none ring-0 placeholder:text-zinc-500 focus:border-white/35"
                />
              </div>

              <button
                onClick={() => setShowFilters(true)}
                className="rounded-full border border-white/10 bg-white/10 px-5 py-3 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white hover:text-black"
              >
                Filtros
              </button>

              <button
                onClick={resetFilters}
                className="rounded-xl border border-white/10 px-4 py-3 text-sm font-black text-zinc-300 transition hover:bg-white/10"
              >
                Resetar
              </button>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2 md:hidden">
              <button
                onClick={() => setShowMobileMenu(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white"
                aria-label="Abrir menu"
              >
                <span className="translate-y-[-1px] text-2xl leading-none">☰</span>
              </button>

              <button
                onClick={() => setShowMobileSearch(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white"
                aria-label="Buscar"
              >
                <span className="translate-y-[-1px] text-xl leading-none">⌕</span>
              </button>

              <button
                onClick={() => setShowFilters(true)}
                className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black text-white"
              >
                Filtros
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="fixed left-3 right-3 top-[148px] z-[60] rounded-2xl border border-red-500/40 bg-red-950/90 p-4 text-sm text-red-100 shadow-2xl md:top-24">
          {error}
        </div>
      )}

      {hero ? (
        <Hero item={hero} onOpen={() => setSelected(hero)} />
      ) : (
        <EmptyHero />
      )}

      <section className="relative z-20 mt-0 space-y-8 px-3 pb-20 md:mt-[-40px] md:px-8">
        <div className="mx-auto max-w-[1800px] space-y-7">
          {showFilters && (
            <FilterModal
              audioMode={audioMode}
              setAudioMode={setAudioMode}
              subtitleMode={subtitleMode}
              setSubtitleMode={setSubtitleMode}
              dubMode={dubMode}
              setDubMode={setDubMode}
              genre={genre}
              setGenre={setGenre}
              ageRating={ageRating}
              setAgeRating={setAgeRating}
              contentFlag={contentFlag}
              setContentFlag={setContentFlag}
              minRating={minRating}
              setMinRating={setMinRating}
              sortBy={sortBy}
              setSortBy={setSortBy}
              allGenres={allGenres}
              allAgeRatings={allAgeRatings}
              allContentFlags={allContentFlags}
              onClose={() => setShowFilters(false)}
              onReset={resetFilters}
            />
          )}

          <div className="flex flex-col gap-4 pt-4 md:flex-row md:items-end md:justify-between md:pt-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-red-500 md:text-sm">
                {page === "home" ? "Catálogo" : "Resultado filtrado"}
              </p>

              <h2 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">
                {page === "catalog"
                  ? "Catálogo completo"
                  : page === "dub"
                    ? "Animes dublados"
                    : page === "sub"
                      ? "Animes com legenda PT-BR"
                      : hasActiveFilters
                        ? "Resultado dos filtros"
                        : "Todos os resultados"}
              </h2>

              <p className="mt-2 max-w-full text-xs leading-relaxed text-zinc-400 md:text-sm">
                {pageFiltered.length} exibidos de {items.length} títulos ·{" "}
                {stats.dub} dublados · {stats.ptBR} com áudio PT-BR ·{" "}
                {stats.subtitlesPTBR} com legendas PT-BR
              </p>
            </div>

            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="w-fit rounded-xl border border-white/10 px-4 py-3 text-sm font-black text-zinc-300 transition hover:bg-white/10"
              >
                Limpar filtros
              </button>
            )}
          </div>

          {hasActiveFilters ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
              {pageFiltered.map((item, index) => (
                <PosterCard
                  key={`${item.id}-${index}`}
                  item={item}
                  onClick={() => setSelected(item)}
                />
              ))}
            </div>
          ) : (
            <>
              {rows.map((row) => (
                <CatalogRow
                  key={row.title}
                  title={row.title}
                  items={row.items}
                  onSelect={setSelected}
                />
              ))}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                {pageFiltered.map((item, index) => (
                  <PosterCard
                    key={`${item.id}-${index}`}
                    item={item}
                    onClick={() => setSelected(item)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {showMobileMenu && (
        <MobileMenuModal
          page={page}
          setPage={setPage}
          onClose={() => setShowMobileMenu(false)}
        />
      )}

      {showMobileSearch && (
        <MobileSearchModal
          query={query}
          setQuery={setQuery}
          onClose={() => setShowMobileSearch(false)}
        />
      )}

      {selected && (
        <DetailsModal item={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-black text-white">
      <div className="text-center">
        <div className="mx-auto mb-5 h-14 w-14 animate-spin rounded-full border-4 border-zinc-800 border-t-red-600" />
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-red-500">
          Carregando catálogo
        </p>
      </div>
    </main>
  );
}

function EmptyHero() {
  return <section className="min-h-[48vh] bg-black pt-40 md:min-h-[60vh]" />;
}

function Hero({ item, onOpen }) {
  return (
    <section className="relative min-h-[74vh] overflow-hidden pt-[152px] md:min-h-[86vh] md:pt-24">
      {item.cover && (
        <img
          src={item.cover}
          alt=""
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-40 blur-[1px]"
        />
      )}

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(220,38,38,0.22),transparent_32%),linear-gradient(90deg,#050505_0%,rgba(5,5,5,0.92)_35%,rgba(5,5,5,0.55)_74%,#050505_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent" />

      <div className="relative z-10 mx-auto grid max-w-[1800px] grid-cols-1 items-center gap-8 px-3 py-8 md:grid-cols-[minmax(0,1fr)_360px] md:px-8 md:py-14 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="max-w-4xl">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] text-red-500 md:text-sm md:tracking-[0.38em]">
            Catálogo local Crunchyroll
          </p>

          <h1 className="line-clamp-4 text-4xl font-black leading-[0.95] tracking-tighter sm:text-5xl md:text-7xl lg:text-8xl">
            {item.title}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-zinc-200 md:mt-5 md:gap-3 md:text-sm">
            {item.rating && (
              <span className="text-emerald-400">⭐ {item.rating}</span>
            )}

            {item.ageRating && (
              <span className="rounded border border-white/35 px-2 py-0.5">
                {item.ageRating}
              </span>
            )}

            <span>
              {[item.seasons, item.episodes].filter(Boolean).join(" · ") ||
                "Temporadas não informadas"}
            </span>

            {item.flags.ptBR && (
              <span className="rounded bg-white px-2 py-0.5 text-black">
                PT-BR
              </span>
            )}
          </div>

          <p className="mt-5 line-clamp-4 max-w-3xl text-sm leading-relaxed text-zinc-200 md:text-xl">
            {item.synopsis || "Sinopse ainda não preenchida no JSON."}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row md:mt-8">
            <button
              onClick={onOpen}
              className="rounded-md bg-white px-6 py-3 text-base font-black text-black transition hover:bg-zinc-200 md:px-8 md:text-lg"
            >
              ▶ Ver detalhes
            </button>

            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-zinc-700/80 px-6 py-3 text-center text-base font-black text-white transition hover:bg-zinc-600 md:px-8 md:text-lg"
              >
                Abrir Crunchyroll
              </a>
            )}
          </div>
        </div>

        <button onClick={onOpen} className="group hidden text-left md:block">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-[0_35px_90px_rgba(0,0,0,0.8)] transition duration-300 group-hover:scale-[1.03] group-hover:border-red-500/60">
            {item.cover ? (
              <img
                src={item.cover}
                alt={item.title}
                className="aspect-[2/3] w-full object-cover"
              />
            ) : (
              <div className="aspect-[2/3] grid place-items-center text-zinc-500">
                Sem capa
              </div>
            )}
          </div>
        </button>
      </div>
    </section>
  );
}

function FilterModal(props) {
  return (
    <div className="fixed left-0 right-0 top-[64px] md:top-[71px] z-[9999] h-[calc(100dvh-64px)] md:h-[calc(100dvh-71px)] overflow-hidden bg-[#050505]/94 backdrop-blur-2xl">
      <button
        onClick={props.onClose}
        className="absolute right-4 top-4 z-[10000] grid h-11 w-11 place-items-center rounded-full bg-white text-xl font-black text-black transition hover:bg-red-600 hover:text-white md:right-8 md:top-8 md:h-12 md:w-12"
        aria-label="Fechar filtros"
      >
        ✕
      </button>

      <section className="h-full overflow-y-auto overflow-x-hidden px-4 pb-8 pt-6 md:flex md:items-center md:justify-center md:px-8 md:pb-10 md:pt-0">
        <div className="w-full max-w-6xl">
          <div className="mb-7 flex flex-col gap-4 pr-14 md:mb-10 md:flex-row md:items-end md:justify-between md:gap-6 md:pr-20">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-red-500 md:text-sm">
                Refinar catálogo
              </p>
              <h2 className="mt-2 text-4xl font-black tracking-tight md:text-6xl">
                Filtros
              </h2>
            </div>

            <button
              onClick={props.onReset}
              className="w-fit rounded-xl border border-white/10 px-4 py-3 text-xs font-black text-zinc-300 transition hover:bg-white/10 md:px-5 md:text-sm"
            >
              Limpar filtros
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
            <Select value={props.audioMode} onChange={props.setAudioMode}>
              <option value="all">Áudio: todos</option>
              <option value="ptbr">Áudio PT-BR</option>
              <option value="no-ptbr">Sem áudio PT-BR</option>
            </Select>

            <Select value={props.subtitleMode} onChange={props.setSubtitleMode}>
              <option value="all">Legendas: todas</option>
              <option value="ptbr">Legendas PT-BR</option>
              <option value="no-ptbr">Sem legenda PT-BR</option>
            </Select>

            <Select value={props.dubMode} onChange={props.setDubMode}>
              <option value="all">Dublagem: todos</option>
              <option value="dub">Dublado</option>
              <option value="sub-only">Somente legendado</option>
              <option value="japanese-only">Somente japonês</option>
            </Select>

            <Select value={props.genre} onChange={props.setGenre}>
              <option value="all">Gênero: todos</option>
              {props.allGenres.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>

            <Select value={props.ageRating} onChange={props.setAgeRating}>
              <option value="all">Idade: todas</option>
              {props.allAgeRatings.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>

            <Select value={props.contentFlag} onChange={props.setContentFlag}>
              <option value="all">Conteúdo: todos</option>
              {props.allContentFlags.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>

            <Select value={props.sortBy} onChange={props.setSortBy}>
              <option value="rating-desc">Melhor avaliação</option>
              <option value="rating-asc">Pior avaliação</option>
              <option value="title-asc">A-Z</option>
              <option value="title-desc">Z-A</option>
              <option value="age-asc">Classificação ↑</option>
              <option value="age-desc">Classificação ↓</option>
            </Select>
          </div>

          <div className="mt-8 md:mt-10">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-black text-zinc-300">Nota mínima</span>
              <span className="rounded-full bg-red-600 px-3 py-1 text-sm font-black text-white">
                {props.minRating}
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={props.minRating}
              onChange={(event) => props.setMinRating(event.target.value)}
              className="w-full accent-red-600"
            />
          </div>

          <div className="mt-8 flex md:mt-12 md:justify-end">
            <button
              onClick={props.onClose}
              className="w-full rounded-xl bg-white px-8 py-4 font-black text-black transition hover:bg-zinc-200 md:w-auto"
            >
              Aplicar filtros
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CatalogRow({ title, items, onSelect }) {
  const rowRef = useRef(null);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const handleWheel = (event) => {
      const canScroll = row.scrollWidth > row.clientWidth;
      if (!canScroll) return;

      const isAtStart = row.scrollLeft <= 0;
      const isAtEnd =
        Math.ceil(row.scrollLeft + row.clientWidth) >= row.scrollWidth;

      const scrollingDown = event.deltaY > 0;
      const scrollingUp = event.deltaY < 0;

      if ((isAtEnd && scrollingDown) || (isAtStart && scrollingUp)) return;

      event.preventDefault();
      row.scrollLeft += event.deltaY;
    };

    row.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      row.removeEventListener("wheel", handleWheel);
    };
  }, []);

  return (
    <section className="relative">
      <h2 className="mb-3 text-xl font-black tracking-tight md:mb-4 md:text-3xl">
        {title}
      </h2>

      <div
        ref={rowRef}
        className="scrollbar-hide flex gap-3 overflow-x-auto overflow-y-hidden scroll-smooth pb-6 pr-8 md:pb-8"
      >
        {items.map((item, index) => (
          <div
            key={`${item.id}-${index}`}
            className="w-[145px] shrink-0 sm:w-[170px] md:w-[220px] xl:w-[240px]"
          >
            <PosterCard item={item} onClick={() => onSelect(item)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PosterCard({ item, onClick }) {
  return (
    <article className="group relative">
      <button onClick={onClick} className="block w-full text-left">
        <div className="relative overflow-hidden rounded-xl bg-zinc-900 shadow-lg ring-1 ring-white/10 transition-[box-shadow,transform] duration-300 ease-out md:group-hover:z-20 md:group-hover:-translate-y-1 md:group-hover:ring-red-500/70 md:group-hover:shadow-[0_18px_55px_rgba(0,0,0,0.75)]">
          <div className="relative aspect-[2/3] overflow-hidden">
            {item.cover ? (
              <img
                src={item.cover}
                alt={item.title}
                className="h-full w-full object-cover transition-transform duration-700 ease-out will-change-transform md:group-hover:scale-[1.08]"
                loading="lazy"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-zinc-600">
                Sem capa
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent opacity-75" />

            <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1 md:left-2 md:top-2">
              {item.ageRating && <Pill>{item.ageRating}</Pill>}
              {item.flags.ptBR && <Pill tone="light">PT-BR</Pill>}
            </div>

            {item.rating && (
              <div className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-1 text-[10px] font-black text-yellow-300 backdrop-blur md:right-2 md:top-2 md:text-xs">
                ⭐ {item.rating}
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 p-2.5 md:p-3">
              <h3 className="line-clamp-2 text-xs font-black leading-tight text-white md:text-base">
                {item.title}
              </h3>
              <p className="mt-1 line-clamp-1 text-[10px] font-semibold text-zinc-300 md:text-xs">
                {item.genres.slice(0, 2).join(" • ") || "Anime"}
              </p>
            </div>
          </div>

          <div className="hidden border-t border-white/10 bg-zinc-950 p-3 md:block">
            <div className="mb-2 flex flex-wrap gap-1">
              <Flag active={item.flags.dub}>Dub</Flag>
              <Flag active={item.flags.subtitlesPTBR}>Leg. PT</Flag>
            </div>
            <p className="line-clamp-2 text-xs leading-relaxed text-zinc-400">
              {item.synopsis || "Sinopse não preenchida."}
            </p>
          </div>
        </div>
      </button>
    </article>
  );
}

function DetailsModal({ item, onClose }) {
  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto overflow-x-hidden md:overflow-hidden bg-black/90 backdrop-blur-xl">
      {item.cover && (
        <img
          src={item.cover}
          alt=""
          className="fixed inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
        />
      )}

      <div className="fixed inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(220,38,38,0.24),transparent_34%),linear-gradient(180deg,rgba(5,5,5,0.72)_0%,#050505_52%,#050505_100%)] md:bg-[radial-gradient(circle_at_75%_25%,rgba(220,38,38,0.28),transparent_34%),linear-gradient(90deg,#050505_0%,rgba(5,5,5,0.92)_34%,rgba(5,5,5,0.55)_68%,#050505_100%)]" />

      <button
        onClick={onClose}
        className="fixed right-4 top-4 z-[10000] grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/15 text-xl font-black text-white backdrop-blur-xl transition hover:bg-white hover:text-black md:right-5 md:top-5 md:h-12 md:w-12"
      >
        ✕
      </button>

      <section className="relative z-10 mx-auto min-h-screen w-full max-w-[1800px] px-4 pb-10 pt-16 md:grid md:h-screen md:grid-cols-[320px_minmax(0,1fr)] md:gap-8 md:p-10 lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="mx-auto mb-6 max-w-[220px] md:mb-0 md:flex md:max-w-none md:items-center">
          <div className="relative w-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/10 p-2 shadow-[0_30px_90px_rgba(0,0,0,0.75)] backdrop-blur-2xl md:rounded-[2rem] md:p-3">
            {item.cover ? (
              <img
                src={item.cover}
                alt={item.title}
                className="aspect-[2/3] w-full rounded-[1rem] object-cover shadow-2xl md:rounded-[1.5rem]"
              />
            ) : (
              <div className="grid aspect-[2/3] place-items-center rounded-[1rem] bg-zinc-900 text-zinc-500 md:rounded-[1.5rem]">
                Sem capa
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col justify-center">
          <div className="max-w-5xl">
            <div className="mb-4 flex flex-wrap gap-2 md:mb-5">
              {item.rating && (
                <span className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-black">
                  ⭐ {item.rating}
                </span>
              )}

              {item.ageRating && (
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-black text-white">
                  {item.ageRating}
                </span>
              )}

              {item.flags.ptBR && (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">
                  PT-BR
                </span>
              )}

              {item.flags.subtitlesPTBR && (
                <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-black text-white">
                  Legendas PT-BR
                </span>
              )}
            </div>

            <h2 className="max-w-5xl text-3xl font-black leading-[0.98] tracking-tighter md:text-6xl xl:text-7xl">
              {item.title}
            </h2>

            <p className="mt-4 text-sm font-bold text-zinc-300 md:mt-5 md:text-base">
              {[item.seasons, item.episodes].filter(Boolean).join(" · ") ||
                "Temporadas não informadas"}
            </p>

            <p className="mt-5 max-w-4xl text-sm leading-relaxed text-zinc-200 md:mt-6 md:line-clamp-5 md:text-lg xl:text-xl">
              {item.synopsis || "Sinopse ainda não preenchida no JSON."}
            </p>

            <div className="mt-6 flex flex-wrap gap-2 md:mt-7">
              <Flag active={item.flags.dub}>Dublado</Flag>
              <Flag active={item.flags.ptBR}>Áudio PT-BR</Flag>
              <Flag active={item.flags.subtitlesPTBR}>Legenda PT-BR</Flag>
              <Flag active={item.flags.onlyJapaneseAudio}>Somente japonês</Flag>
            </div>

            <div className="mt-6 grid gap-3 md:mt-8 md:grid-cols-3">
              <DetailBlock label="Áudio" value={item.audio.join(", ") || "—"} />
              <DetailBlock
                label="Legendas"
                value={item.subtitles.join(", ") || "—"}
              />
              <DetailBlock
                label="Gêneros"
                value={item.genres.join(", ") || "—"}
              />
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row md:mt-8">
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-white px-6 py-3 text-center font-black text-black transition hover:bg-zinc-200"
                >
                  Abrir Crunchyroll
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Select({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-12 rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-red-500"
    >
      {children}
    </select>
  );
}

function Pill({ children, tone = "red" }) {
  const className =
    tone === "light"
      ? "rounded bg-white px-1.5 py-1 text-[9px] font-black text-black md:px-2 md:text-[10px]"
      : "rounded bg-red-600 px-1.5 py-1 text-[9px] font-black text-white md:px-2 md:text-[10px]";

  return <span className={className}>{children}</span>;
}

function Flag({ active, children }) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-black"
          : "rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-zinc-500"
      }
    >
      {children}
    </span>
  );
}

function DetailBlock({ label, value }) {
  return (
    <div className="min-h-[82px] rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-xl md:min-h-[92px]">
      <div className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-2 break-words text-sm leading-relaxed text-zinc-200 md:line-clamp-2">
        {value}
      </div>
    </div>
  );
}

function MobileMenuModal({ page, setPage, onClose }) {
  const goTo = (value) => {
    setPage(value);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-2xl md:hidden">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white text-xl font-black text-black"
      >
        ✕
      </button>

      <div className="flex min-h-screen flex-col justify-center px-6">
        <p className="mb-4 text-xs font-black uppercase tracking-[0.35em] text-red-500">
          Menu
        </p>

        <div className="space-y-3">
          <MobileMenuButton active={page === "home"} onClick={() => goTo("home")}>Início</MobileMenuButton>
          <MobileMenuButton active={page === "catalog"} onClick={() => goTo("catalog")}>Catálogo</MobileMenuButton>
          <MobileMenuButton active={page === "dub"} onClick={() => goTo("dub")}>Dublados</MobileMenuButton>
          <MobileMenuButton active={page === "sub"} onClick={() => goTo("sub")}>Legendas PT-BR</MobileMenuButton>
        </div>
      </div>
    </div>
  );
}

function MobileMenuButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "w-full rounded-2xl bg-white px-5 py-4 text-left text-xl font-black text-black"
          : "w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left text-xl font-black text-white"
      }
    >
      {children}
    </button>
  );
}

function MobileSearchModal({ query, setQuery, onClose }) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 px-4 pt-20 backdrop-blur-2xl md:hidden">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white text-xl font-black text-black"
      >
        ✕
      </button>

      <p className="mb-4 text-xs font-black uppercase tracking-[0.35em] text-red-500">
        Buscar
      </p>

      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar anime, gênero, áudio..."
        className="w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-lg font-bold text-white outline-none placeholder:text-zinc-500 focus:border-red-500"
      />

      <button
        onClick={onClose}
        className="mt-5 w-full rounded-2xl bg-white px-5 py-4 font-black text-black"
      >
        Ver resultados
      </button>
    </div>
  );
}