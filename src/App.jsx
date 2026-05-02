import { useEffect, useMemo, useState } from "react";

const CATALOG_URL = "/catalogo_crunchyroll_full.json";

const normalize = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const splitList = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap(splitList).filter(Boolean);
  }

  if (!value) return [];

  return String(value)
    .split(/,|•|\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^\d+$/.test(item));
};

const unique = (list) => [...new Set(list.map((item) => String(item).trim()).filter(Boolean))];

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

const getRatingValue = (value) => {
  if (!value) return "";
  if (typeof value === "object") return String(value.average ?? value.rating ?? "");
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
  value = value.replace(/width=\d+/g, "width=480");
  value = value.replace(/height=\d+/g, "height=720");
  value = value.replace(/quality=\d+/g, "quality=95");

  return value;
};

const getTitle = (item = {}) => String(item.title || item.name || "Untitled").trim();
const getUrl = (item = {}) => String(item.officialUrl || item.url || item.href || "").trim();
const getCover = (item = {}) => cleanCoverUrl(item.cover || item.image || item.poster || "");

const normalizeItem = (input) => {
  const item = input && typeof input === "object" ? input : {};

  const audio = unique(splitList(item.audio));
  const subtitles = unique(splitList(item.subtitles));
  const genres = unique(splitList(item.genres));
  const contentDescriptors = unique(splitList(item.contentDescriptors || item.contentRating));
  const contentRating = String(item.contentRating || "").trim();
  const ageRating = String(item.ageRating || "").trim();
  const rating = getRatingValue(item.rating);
  const url = getUrl(item);
  const title = getTitle(item);
  const synopsis = String(item.synopsis || item.description || item.summary || "").trim();

  const ptBR = Boolean(item.ptBR || item.flags?.ptBR || hasPtBr(audio));
  const subtitlesPTBR = Boolean(item.subtitlesPTBR || item.flags?.subtitlesPTBR || hasPtBr(subtitles));

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
    flags: {
      dub,
      ptBR,
      subtitlesPTBR,
      romance,
      onlyJapaneseAudio,
    },
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
  const [sortBy, setSortBy] = useState("title-asc");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          throw new Error("Invalid JSON: expected an array or an object with items.");
        }
        setRawItems(list);
      })
      .catch((err) => {
        console.error(err);
        setError(`Could not load ${CATALOG_URL}. Check if the file exists inside /public.`);
      })
      .finally(() => setLoading(false));
  }, []);

  const items = useMemo(() => {
    return rawItems
      .filter(Boolean)
      .map(normalizeItem)
      .filter((item) => item.title && item.title !== "Untitled");
  }, [rawItems]);

  const allGenres = useMemo(() => {
    const set = new Set();
    items.forEach((item) => item.genres.forEach((value) => set.add(value)));
    return [...set].sort((a, b) => a.localeCompare(b, "en"));
  }, [items]);

  const allAgeRatings = useMemo(() => {
    const set = new Set();
    items.forEach((item) => {
      if (item.ageRating) set.add(item.ageRating);
    });

    return [...set].sort((a, b) => {
      const av = ageSortOrder[a] ?? 999;
      const bv = ageSortOrder[b] ?? 999;
      return av - bv || a.localeCompare(b);
    });
  }, [items]);

  const allContentFlags = useMemo(() => {
    const set = new Set();
    items.forEach((item) => {
      item.contentDescriptors.forEach((value) => set.add(value));
    });
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
        ].join(" ")
      );

      if (q && !searchableText.includes(q)) return false;
      if (audioMode === "ptbr" && !item.flags.ptBR) return false;
      if (audioMode === "no-ptbr" && item.flags.ptBR) return false;
      if (subtitleMode === "ptbr" && !item.flags.subtitlesPTBR) return false;
      if (subtitleMode === "no-ptbr" && item.flags.subtitlesPTBR) return false;
      if (dubMode === "dub" && !item.flags.dub) return false;
      if (dubMode === "sub-only" && item.flags.dub) return false;
      if (dubMode === "japanese-only" && !item.flags.onlyJapaneseAudio) return false;
      if (genre !== "all" && !item.genres.some((value) => normalize(value) === normalize(genre))) return false;
      if (ageRating !== "all" && item.ageRating !== ageRating) return false;
      if (contentFlag !== "all" && !item.contentDescriptors.some((value) => normalize(value) === normalize(contentFlag))) return false;
      if (item.ratingNumber < Number(minRating)) return false;

      return true;
    });

    result.sort((a, b) => {
      if (sortBy === "title-asc") return a.title.localeCompare(b.title, "en");
      if (sortBy === "title-desc") return b.title.localeCompare(a.title, "en");
      if (sortBy === "rating-desc") return b.ratingNumber - a.ratingNumber;
      if (sortBy === "rating-asc") return a.ratingNumber - b.ratingNumber;
      if (sortBy === "age-asc") return (ageSortOrder[a.ageRating] ?? 999) - (ageSortOrder[b.ageRating] ?? 999);
      if (sortBy === "age-desc") return (ageSortOrder[b.ageRating] ?? -1) - (ageSortOrder[a.ageRating] ?? -1);
      return 0;
    });

    return result;
  }, [items, query, audioMode, subtitleMode, dubMode, genre, ageRating, contentFlag, minRating, sortBy]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      filtered: filtered.length,
      dub: items.filter((item) => item.flags.dub).length,
      ptBR: items.filter((item) => item.flags.ptBR).length,
      subtitlesPTBR: items.filter((item) => item.flags.subtitlesPTBR).length,
      withGenres: items.filter((item) => item.genres.length).length,
      withAgeRating: items.filter((item) => item.ageRating).length,
      withContentFlags: items.filter((item) => item.contentDescriptors.length).length,
      withSynopsis: items.filter((item) => item.synopsis).length,
    };
  }, [items, filtered]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError("");
      const text = await file.text();
      const json = JSON.parse(text);
      const list = Array.isArray(json) ? json : json.items;
      if (!Array.isArray(list)) throw new Error("The JSON must be an array or an object with items.");
      setRawItems(list);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not read JSON.");
    }
  };

  const copyFiltered = async () => {
    await navigator.clipboard.writeText(JSON.stringify(filtered, null, 2));
  };

  const resetFilters = () => {
    setQuery("");
    setAudioMode("all");
    setSubtitleMode("all");
    setDubMode("all");
    setGenre("all");
    setAgeRating("all");
    setContentFlag("all");
    setMinRating("0");
    setSortBy("title-asc");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
        <p className="text-orange-400 font-semibold">Loading catalog...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-5 md:p-8">
      <section className="mx-auto max-w-[1780px] space-y-7">
        <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm text-orange-400 font-bold">Crunchyroll local filter</p>
            <h1 className="mt-2 text-4xl md:text-6xl font-black tracking-tight">Local catalog with useful filters</h1>
            <p className="mt-3 max-w-3xl text-neutral-400 text-lg leading-relaxed">
              Browse your local Crunchyroll catalog JSON with language, age rating, content flags, score, genre, and title search.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="cursor-pointer rounded-2xl bg-orange-500 px-7 py-4 font-bold text-neutral-950 shadow-lg hover:bg-orange-400">
              Load JSON
              <input type="file" accept="application/json,.json" className="hidden" onChange={handleFile} />
            </label>
            <button onClick={copyFiltered} className="rounded-2xl border border-neutral-700 px-7 py-4 font-bold hover:bg-neutral-900">
              Copy filtered
            </button>
            <button onClick={resetFilters} className="rounded-2xl border border-neutral-800 px-7 py-4 font-bold text-neutral-300 hover:bg-neutral-900">
              Reset
            </button>
          </div>
        </header>

        {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">{error}</div>}

        <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-3">
          <Stat label="Total" value={stats.total} />
          <Stat label="Filtered" value={stats.filtered} />
          <Stat label="Real dub" value={stats.dub} />
          <Stat label="PT-BR audio" value={stats.ptBR} />
          <Stat label="PT-BR subs" value={stats.subtitlesPTBR} />
          <Stat label="With genre" value={stats.withGenres} />
          <Stat label="Age rating" value={stats.withAgeRating} />
          <Stat label="Content flags" value={stats.withContentFlags} />
          <Stat label="Synopsis" value={stats.withSynopsis} />
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-4 md:p-5 shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-8 gap-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, genre, audio, rating..."
              className="xl:col-span-2 rounded-2xl bg-neutral-950 border border-neutral-800 px-5 py-4 outline-none focus:border-orange-400"
            />

            <Select value={audioMode} onChange={setAudioMode}>
              <option value="all">Audio: all</option>
              <option value="ptbr">PT-BR audio</option>
              <option value="no-ptbr">No PT-BR audio</option>
            </Select>

            <Select value={subtitleMode} onChange={setSubtitleMode}>
              <option value="all">Subs: all</option>
              <option value="ptbr">PT-BR subs</option>
              <option value="no-ptbr">No PT-BR subs</option>
            </Select>

            <Select value={dubMode} onChange={setDubMode}>
              <option value="all">Dub: all</option>
              <option value="dub">Real dub</option>
              <option value="sub-only">Sub only</option>
              <option value="japanese-only">Japanese only</option>
            </Select>

            <Select value={genre} onChange={setGenre}>
              <option value="all">Genre: all</option>
              {allGenres.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>

            <Select value={ageRating} onChange={setAgeRating}>
              <option value="all">Age: all</option>
              {allAgeRatings.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>

            <Select value={contentFlag} onChange={setContentFlag}>
              <option value="all">Content: all</option>
              {allContentFlags.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>

            <Select value={sortBy} onChange={setSortBy}>
              <option value="title-asc">A-Z</option>
              <option value="title-desc">Z-A</option>
              <option value="rating-desc">Highest score</option>
              <option value="rating-asc">Lowest score</option>
              <option value="age-asc">Age rating ↑</option>
              <option value="age-desc">Age rating ↓</option>
            </Select>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-sm text-neutral-400">Minimum score</label>
            <input type="range" min="0" max="5" step="0.1" value={minRating} onChange={(event) => setMinRating(event.target.value)} className="w-64 max-w-full" />
            <span className="font-mono text-orange-300">{minRating}</span>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-5">
          {filtered.map((item, index) => (
            <AnimeCard key={`${item.id}-${index}`} item={item} onClick={() => setSelected(item)} />
          ))}
        </section>
      </section>

      {selected && <DetailsModal item={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function AnimeCard({ item, onClick }) {
  return (
    <article className="group overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-xl hover:border-orange-500/60 transition">
      <button onClick={onClick} className="block w-full text-left">
        <div className="relative aspect-[2/3] bg-neutral-800 overflow-hidden">
          {item.cover ? (
            <img src={item.cover} alt={item.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" />
          ) : (
            <div className="h-full w-full grid place-items-center text-neutral-500">No cover</div>
          )}

          <div className="absolute left-3 top-3 flex gap-2">
            {item.ageRating && <Badge strong>{item.ageRating}</Badge>}
            {item.rating && <Badge strong>⭐ {item.rating}</Badge>}
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-4 pt-20">
            <h2 className="text-xl font-black leading-tight line-clamp-2">{item.title}</h2>
            <p className="mt-1 text-xs text-neutral-300">
              {[item.seasons, item.episodes].filter(Boolean).join(" · ") || "No count"}
            </p>
          </div>
        </div>
      </button>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Flag active={item.flags.dub}>Dub</Flag>
          <Flag active={item.flags.ptBR}>PT-BR audio</Flag>
          <Flag active={item.flags.subtitlesPTBR}>PT-BR subs</Flag>
        </div>

        <Meta label="Audio" value={compactList(item.audio, 4)} />
        <Meta label="Subs" value={compactList(item.subtitles, 4)} />
        <Meta label="Content" value={item.contentRating || "—"} />
        <Meta label="Genre" value={item.genres.length ? item.genres.join(", ") : "—"} />

        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="block rounded-2xl bg-neutral-800 px-4 py-3 text-center font-bold hover:bg-neutral-700">
            Open on Crunchyroll
          </a>
        )}
      </div>
    </article>
  );
}

function DetailsModal({ item, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm p-4 md:p-8 overflow-y-auto">
      <div className="mx-auto max-w-6xl rounded-3xl border border-neutral-800 bg-neutral-950 shadow-2xl overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[360px_1fr]">
          <div className="bg-neutral-900">
            {item.cover ? <img src={item.cover} alt={item.title} className="h-full w-full object-cover" /> : <div className="min-h-[520px] grid place-items-center text-neutral-500">No cover</div>}
          </div>

          <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-orange-400">Details</p>
                <h2 className="mt-1 text-3xl md:text-5xl font-black leading-tight">{item.title}</h2>
                <p className="mt-2 text-neutral-400">
                  {[item.seasons, item.episodes].filter(Boolean).join(" · ") || "No season/episode count"}
                </p>
              </div>

              <button onClick={onClose} className="rounded-full border border-neutral-700 px-4 py-2 font-bold hover:bg-neutral-900">Close</button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge strong>⭐ {item.rating || "—"}</Badge>
              {item.ageRating && <Badge strong>{item.ageRating}</Badge>}
              <Flag active={item.flags.dub}>Dub</Flag>
              <Flag active={item.flags.ptBR}>PT-BR audio</Flag>
              <Flag active={item.flags.subtitlesPTBR}>PT-BR subs</Flag>
              <Flag active={item.flags.onlyJapaneseAudio}>Japanese only</Flag>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DetailBlock label="Audio" value={item.audio.join(", ") || "—"} />
              <DetailBlock label="Subtitles" value={item.subtitles.join(", ") || "—"} />
              <DetailBlock label="Genres" value={item.genres.join(", ") || "—"} />
              <DetailBlock label="Content rating" value={item.contentRating || "—"} />
              <DetailBlock label="Age rating" value={item.ageRating || "—"} />
              <DetailBlock label="URL" value={item.url || "—"} />
            </div>

            {item.synopsis && (
              <div>
                <h3 className="text-sm uppercase tracking-wide text-neutral-500 font-bold">Synopsis</h3>
                <p className="mt-2 text-neutral-300 leading-relaxed">{item.synopsis}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer" className="rounded-2xl bg-orange-500 px-6 py-3 font-black text-neutral-950 hover:bg-orange-400">
                  Open on Crunchyroll
                </a>
              )}
              <button onClick={() => navigator.clipboard.writeText(JSON.stringify(item, null, 2))} className="rounded-2xl border border-neutral-700 px-6 py-3 font-bold hover:bg-neutral-900">
                Copy item JSON
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Select({ value, onChange, children }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-2xl bg-neutral-950 border border-neutral-800 px-4 py-4 outline-none focus:border-orange-400">
      {children}
    </select>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4 shadow-lg">
      <div className="text-3xl font-black">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-neutral-500">{label}</div>
    </div>
  );
}

function Badge({ children, strong = false }) {
  return (
    <span className={strong ? "rounded-full bg-orange-500 px-3 py-1 text-xs font-black text-neutral-950" : "rounded-full bg-neutral-800 px-3 py-1 text-xs font-bold text-neutral-300"}>
      {children}
    </span>
  );
}

function Flag({ active, children }) {
  return (
    <span className={active ? "rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-neutral-950" : "rounded-full bg-neutral-800 px-3 py-1 text-xs font-bold text-neutral-500"}>
      {children}
    </span>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-bold">{label}</div>
      <div className="mt-1 text-sm text-neutral-300 line-clamp-2">{value || "—"}</div>
    </div>
  );
}

function DetailBlock({ label, value }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500 font-bold">{label}</div>
      <div className="mt-2 text-neutral-200 break-words">{value}</div>
    </div>
  );
}

function compactList(list, limit = 4) {
  if (!list || !list.length) return "—";
  if (list.length <= limit) return list.join(", ");
  return `${list.slice(0, limit).join(", ")} +${list.length - limit}`;
}
