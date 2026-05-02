import { useEffect, useMemo, useState } from "react";

const CATALOG_URL = "/catalogo_crunchyroll_full.json";

const normalize = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const asArray = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => asArray(item)).filter(Boolean);
  }

  if (!value) return [];

  return String(value)
    .split(/,|•|\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^\d+$/.test(item));
};

const hasPtBr = (values) =>
  asArray(values).some((item) => {
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

const hasOnlyJapaneseAudio = (audio) => {
  const list = asArray(audio).map(normalize).filter(Boolean);
  if (!list.length) return false;
  return list.every((item) => isJapanese(item));
};

const hasRealDub = (item = {}) => {
  const audio = asArray(item.audio);

  if (audio.length > 0) {
    if (hasPtBr(audio)) return true;
    if (audio.length > 1) return true;
    return audio.some((lang) => !isJapanese(lang));
  }

  return Boolean(item.dub || item.flags?.dub);
};

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

const getTitle = (item = {}) =>
  String(item.title || item.name || "Sem título").trim();

const cleanCoverUrl = (url = "") => {
  let value = String(url || "").trim();

  if (!value) return "";

  // Remove o blur capturado do thumbnail lazy
  value = value.replace(/,?blur=\d+/g, "");

  // Aumenta a resolução da capa
  value = value.replace(/width=\d+/g, "width=360");
  value = value.replace(/height=\d+/g, "height=540");

  // Melhora qualidade se existir quality
  value = value.replace(/quality=\d+/g, "quality=95");

  return value;
};

const getCover = (item = {}) =>
  cleanCoverUrl(item.cover || item.image || item.poster || "");

const getUrl = (item = {}) => String(item.url || item.href || "").trim();

const validSeasonText = (value) =>
  /^\d+\s+temporadas?$/i.test(String(value || "").trim());

const validEpisodeText = (value) =>
  /^\d+\s+epis[oó]dios?$/i.test(String(value || "").trim());

const normalizeItem = (input) => {
  const item = input && typeof input === "object" ? input : {};

  const audio = asArray(item.audio);
  const subtitles = asArray(item.subtitles);
  const genres = asArray(item.genres);

  const ptBR = hasPtBr(audio);
  const subtitlesPTBR =
    Boolean(item.subtitlesPTBR || item.flags?.subtitlesPTBR) ||
    hasPtBr(subtitles);

  const dub = hasRealDub(item);

  const synopsis = item.synopsis || item.description || item.summary || "";

  const romance =
    Boolean(item.flags?.romance) ||
    genres.some((g) => normalize(g).includes("romance")) ||
    normalize(synopsis).includes("romance");

  return {
    ...item,
    id: String(item.id || getUrl(item) || getTitle(item)),
    title: getTitle(item),
    url: getUrl(item),
    cover: getCover(item),
    rating: getRatingValue(item.rating),
    votes: item.votes || "",
    seasons: validSeasonText(item.seasons) ? item.seasons : "",
    episodes: validEpisodeText(item.episodes) ? item.episodes : "",
    synopsis,
    audio,
    subtitles,
    genres,
    contentRating: item.contentRating || "",
    copyright: item.copyright || "",
    flags: {
      dub,
      ptBR,
      subtitlesPTBR,
      romance,
      onlyJapaneseAudio: hasOnlyJapaneseAudio(audio),
    },
  };
};

export default function App() {
  const [rawItems, setRawItems] = useState([]);
  const [query, setQuery] = useState("");
  const [audioMode, setAudioMode] = useState("all");
  const [subtitleMode, setSubtitleMode] = useState("all");
  const [dubMode, setDubMode] = useState("all");
  const [genre, setGenre] = useState("all");
  const [minRating, setMinRating] = useState("0");
  const [sortBy, setSortBy] = useState("title-asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    fetch(CATALOG_URL)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        return res.json();
      })
      .then((json) => {
        const list = Array.isArray(json) ? json : json.items;

        if (!Array.isArray(list)) {
          throw new Error("JSON inválido: esperado array ou objeto com items.");
        }

        setRawItems(list);
      })
      .catch((err) => {
        console.error("Erro ao carregar catálogo:", err);
        setError(
          `Não consegui carregar ${CATALOG_URL}. Verifique se o arquivo está dentro da pasta public.`,
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const items = useMemo(() => {
    return rawItems
      .filter(Boolean)
      .map(normalizeItem)
      .filter((item) => item.title && item.title !== "Sem título");
  }, [rawItems]);

  const allGenres = useMemo(() => {
    const set = new Set();

    items.forEach((item) => {
      item.genres.forEach((g) => {
        const value = String(g || "").trim();
        if (value) set.add(value);
      });
    });

    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const filtered = useMemo(() => {
    const q = normalize(query);

    const list = items.filter((item) => {
      const searchableText = normalize(
        [
          item.title,
          item.synopsis,
          item.audio.join(" "),
          item.subtitles.join(" "),
          item.genres.join(" "),
          item.contentRating,
        ].join(" "),
      );

      if (q && !searchableText.includes(q)) return false;

      if (audioMode === "ptbr" && !item.flags.ptBR) return false;
      if (audioMode === "no-ptbr" && item.flags.ptBR) return false;

      if (subtitleMode === "ptbr" && !item.flags.subtitlesPTBR) return false;
      if (subtitleMode === "no-ptbr" && item.flags.subtitlesPTBR) return false;

      if (dubMode === "dub" && !item.flags.dub) return false;
      if (dubMode === "sub-only" && item.flags.dub) return false;
      if (dubMode === "japanese-only" && !item.flags.onlyJapaneseAudio)
        return false;

      if (genre !== "all") {
        const genreNorm = normalize(genre);
        if (!item.genres.some((g) => normalize(g) === genreNorm)) return false;
      }

      if (toNumber(item.rating) < toNumber(minRating)) return false;

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "title-asc")
        return a.title.localeCompare(b.title, "pt-BR");
      if (sortBy === "title-desc")
        return b.title.localeCompare(a.title, "pt-BR");
      if (sortBy === "rating-desc")
        return toNumber(b.rating) - toNumber(a.rating);
      if (sortBy === "rating-asc")
        return toNumber(a.rating) - toNumber(b.rating);
      return 0;
    });

    return list;
  }, [
    items,
    query,
    audioMode,
    subtitleMode,
    dubMode,
    genre,
    minRating,
    sortBy,
  ]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      filtered: filtered.length,
      dub: items.filter((x) => x.flags.dub).length,
      ptBR: items.filter((x) => x.flags.ptBR).length,
      subtitlesPTBR: items.filter((x) => x.flags.subtitlesPTBR).length,
      withGenres: items.filter((x) => x.genres.length).length,
    };
  }, [items, filtered]);

  const handleFile = async (event) => {
    setError("");

    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const list = Array.isArray(json) ? json : json.items;

      if (!Array.isArray(list)) {
        throw new Error("O JSON precisa ser um array ou um objeto com items.");
      }

      setRawItems(list);
    } catch (err) {
      console.error(err);
      setError(err.message || "Erro ao ler JSON.");
    }
  };

  const copyFiltered = async () => {
    await navigator.clipboard.writeText(JSON.stringify(filtered, null, 2));
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
        <div className="mx-auto max-w-7xl">
          <p className="text-orange-400 font-semibold">
            Carregando catálogo...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm text-orange-400 font-semibold">
              Crunchyroll local filter
            </p>

            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
              Catálogo com filtro decente
            </h1>

            <p className="mt-2 text-neutral-400 max-w-2xl">
              Filtre seu JSON local por dublagem, áudio PT-BR, legendas, gênero,
              nota e busca textual.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="cursor-pointer rounded-2xl bg-orange-500 px-5 py-3 font-semibold text-neutral-950 shadow-lg hover:bg-orange-400">
              Carregar JSON
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleFile}
              />
            </label>

            <button
              onClick={copyFiltered}
              className="rounded-2xl border border-neutral-700 px-5 py-3 font-semibold hover:bg-neutral-900"
            >
              Copiar filtrados
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
            {error}
          </div>
        )}

        <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Stat label="Total" value={stats.total} />
          <Stat label="Filtrados" value={stats.filtered} />
          <Stat label="Dub real" value={stats.dub} />
          <Stat label="Áudio PT-BR" value={stats.ptBR} />
          <Stat label="Legenda PT-BR" value={stats.subtitlesPTBR} />
          <Stat label="Com gênero" value={stats.withGenres} />
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-4 shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar título, gênero, áudio..."
              className="md:col-span-2 rounded-2xl bg-neutral-950 border border-neutral-800 px-4 py-3 outline-none focus:border-orange-400"
            />

            <Select value={audioMode} onChange={setAudioMode}>
              <option value="all">Áudio: todos</option>
              <option value="ptbr">Áudio PT-BR</option>
              <option value="no-ptbr">Sem áudio PT-BR</option>
            </Select>

            <Select value={subtitleMode} onChange={setSubtitleMode}>
              <option value="all">Legenda: todas</option>
              <option value="ptbr">Legenda PT-BR</option>
              <option value="no-ptbr">Sem legenda PT-BR</option>
            </Select>

            <Select value={dubMode} onChange={setDubMode}>
              <option value="all">Dub: todos</option>
              <option value="dub">Tem dub real</option>
              <option value="sub-only">Sem dub</option>
              <option value="japanese-only">Só japonês</option>
            </Select>

            <Select value={genre} onChange={setGenre}>
              <option value="all">Gênero: todos</option>
              {allGenres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>

            <Select value={sortBy} onChange={setSortBy}>
              <option value="title-asc">A-Z</option>
              <option value="title-desc">Z-A</option>
              <option value="rating-desc">Maior nota</option>
              <option value="rating-asc">Menor nota</option>
            </Select>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <label className="text-sm text-neutral-400">Nota mínima</label>

            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
              className="w-60"
            />

            <span className="font-mono text-orange-300">{minRating}</span>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map((item, index) => (
            <article
              key={`${item.id}-${item.url}-${index}`}
              className="rounded-3xl overflow-hidden border border-neutral-800 bg-neutral-900 shadow-xl"
            >
              <div className="aspect-[2/3] bg-neutral-800 overflow-hidden">
                {item.cover ? (
                  <img
                    src={item.cover}
                    alt={item.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center text-neutral-500">
                    Sem capa
                  </div>
                )}
              </div>

              <div className="p-4 space-y-3">
                <div>
                  <h2 className="font-bold leading-tight text-lg">
                    {item.title}
                  </h2>

                  <p className="text-sm text-neutral-400">
                    ⭐ {item.rating || "—"}{" "}
                    {item.votes ? `· ${item.votes}` : ""}
                  </p>

                  <p className="text-xs text-neutral-500">
                    {[item.seasons, item.episodes]
                      .filter(Boolean)
                      .join(" · ") || "Sem contagem"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge active={item.flags.dub}>Dub</Badge>
                  <Badge active={item.flags.ptBR}>Áudio PT-BR</Badge>
                  <Badge active={item.flags.subtitlesPTBR}>Legenda PT-BR</Badge>
                  <Badge active={item.flags.romance}>Romance</Badge>
                </div>

                <Info label="Áudio" value={item.audio.join(", ")} />
                <Info label="Legendas" value={item.subtitles.join(", ")} />
                <Info label="Gêneros" value={item.genres.join(", ")} />
                <Info label="Classificação" value={item.contentRating} />

                {item.synopsis && (
                  <p className="text-sm text-neutral-400">
                    {item.synopsis.length > 260
                      ? `${item.synopsis.slice(0, 260)}...`
                      : item.synopsis}
                  </p>
                )}

                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl bg-neutral-800 px-4 py-2 text-center font-semibold hover:bg-neutral-700"
                  >
                    Abrir no Crunchyroll
                  </a>
                )}
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}

function Select({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-2xl bg-neutral-950 border border-neutral-800 px-4 py-3 outline-none focus:border-orange-400"
    >
      {children}
    </select>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </div>
    </div>
  );
}

function Badge({ active, children }) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-orange-400 px-3 py-1 text-xs font-bold text-neutral-950"
          : "rounded-full bg-neutral-800 px-3 py-1 text-xs font-semibold text-neutral-500"
      }
    >
      {children}
    </span>
  );
}

function Info({ label, value }) {
  if (!value) return null;

  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="text-sm text-neutral-300">{value}</div>
    </div>
  );
}
