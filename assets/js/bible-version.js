// Tradução da Bíblia usada nos jogos que citam texto literal de
// versículo (complete-o-versiculo, qual-a-passagem, quem-disse-isso).
// Preferência é do site inteiro (não por jogo) e persiste em
// localStorage puro — não é algo específico de uma partida.
//
// Não guardamos o texto de cada tradução localmente: usamos a
// "reference" que cada entrada já tem (ex: "João 3:16") pra buscar o
// texto certo na hora, na API pública abibliadigital.api.br, com cache
// (localStorage) pra não repetir a mesma chamada de novo. Se a
// referência não for reconhecida (cita mais de um trecho, ou não é uma
// referência de verso de verdade — ex: "Estudo textual") ou a API
// falhar, cai de volta pro texto já salvo localmente sem quebrar nada.

const VERSION_KEY = "bibflix_bible_version_v1";
const CACHE_KEY = "bibflix_bible_cache_v1";
const API_BASE = "https://abibliadigital.api.br/api/verses";
const FETCH_TIMEOUT_MS = 4000;

export const BIBLE_VERSIONS = [
  { id: "original", label: "Padrão do site" },
  { id: "acf", label: "Almeida (ACF)" },
  { id: "ntlh", label: "NTLH" },
];

// Nomes de livro em português (como aparecem nos data.json dos jogos,
// sempre "1 João" / "2 Reis", nunca com º/ª) -> abreviação usada pela
// API. Gerado a partir de /api/books; alguns aliases extras cobrem
// grafias com/sem "de" (ex: "Lamentações" -> mesmo livro que
// "Lamentações de Jeremias").
const BOOK_ABBREV = {
  "genesis": "gn", "exodo": "ex", "levitico": "lv", "numeros": "nm",
  "deuteronomio": "dt", "josue": "js", "juizes": "jz", "rute": "rt",
  "1 samuel": "1sm", "2 samuel": "2sm", "1 reis": "1rs", "2 reis": "2rs",
  "1 cronicas": "1cr", "2 cronicas": "2cr", "esdras": "ed",
  "neemias": "ne", "ester": "et", "jo": "job",
  "salmos": "sl", "salmo": "sl", "proverbios": "pv", "eclesiastes": "ec",
  "canticos": "ct", "cantico dos canticos": "ct", "cantico de salomao": "ct",
  "isaias": "is", "jeremias": "jr", "lamentacoes": "lm",
  "lamentacoes de jeremias": "lm", "ezequiel": "ez", "daniel": "dn",
  "oseias": "os", "joel": "jl", "amos": "am", "obadias": "ob",
  "jonas": "jn", "miqueias": "mq", "naum": "na", "habacuque": "hc",
  "sofonias": "sf", "ageu": "ag", "zacarias": "zc", "malaquias": "ml",
  "mateus": "mt", "marcos": "mc", "lucas": "lc", "joao": "jo",
  "atos": "at", "romanos": "rm", "1 corintios": "1co",
  "2 corintios": "2co", "galatas": "gl", "efesios": "ef",
  "filipenses": "fp", "colossenses": "cl", "1 tessalonicenses": "1ts",
  "2 tessalonicenses": "2ts", "1 timoteo": "1tm", "2 timoteo": "2tm",
  "tito": "tt", "filemom": "fm", "hebreus": "hb", "tiago": "tg",
  "1 pedro": "1pe", "2 pedro": "2pe", "1 joao": "1jo", "2 joao": "2jo",
  "3 joao": "3jo", "judas": "jd", "apocalipse": "ap",
};

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[°ºª.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// "João 3:16" -> {abbrev:"jo", chapter:3, start:16, end:16}
// "Mateus 2:1-11" -> {abbrev:"mt", chapter:2, start:1, end:11}
// Referências com ";" (mais de uma citação) ou sem o padrão
// "Livro capítulo:verso" (ex: "Estudo textual") retornam null.
export function parseReference(reference) {
  const ref = String(reference || "").trim();
  if (!ref || ref.includes(";")) return null;

  const m = ref.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!m) return null;

  const [, bookRaw, chapterRaw, startRaw, endRaw] = m;
  const abbrev = BOOK_ABBREV[normalize(bookRaw)];
  if (!abbrev) return null;

  return {
    abbrev,
    chapter: Number(chapterRaw),
    start: Number(startRaw),
    end: endRaw ? Number(endRaw) : Number(startRaw),
  };
}

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* localStorage indisponível/cheio — sem cache, sem drama */
  }
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Busca o texto de uma referência numa tradução (via cache ou API).
// Retorna null se a referência não puder ser interpretada ou a busca
// falhar — quem chamou deve usar o texto local original nesse caso.
async function fetchVerseText(reference, versionId) {
  const parsed = parseReference(reference);
  if (!parsed) return null;

  const cacheKey = `${versionId}:${reference}`;
  const cache = loadCache();
  if (cache[cacheKey]) return cache[cacheKey];

  try {
    let text;
    if (parsed.start === parsed.end) {
      const data = await fetchWithTimeout(
        `${API_BASE}/${versionId}/${parsed.abbrev}/${parsed.chapter}/${parsed.start}`
      );
      text = data?.text;
    } else {
      // Intervalo de versos (ex: "2:1-11") — busca o capítulo inteiro e
      // junta só o trecho pedido.
      const data = await fetchWithTimeout(
        `${API_BASE}/${versionId}/${parsed.abbrev}/${parsed.chapter}`
      );
      const verses = (data?.verses || []).filter(
        (v) => v.number >= parsed.start && v.number <= parsed.end
      );
      text = verses.map((v) => v.text).join(" ");
    }
    if (!text) return null;

    cache[cacheKey] = text;
    saveCache(cache);
    return text;
  } catch {
    return null; // rede offline, timeout, referência inexistente etc.
  }
}

export const BibleVersion = {
  get() {
    try {
      const v = localStorage.getItem(VERSION_KEY);
      return BIBLE_VERSIONS.some((x) => x.id === v) ? v : "original";
    } catch {
      return "original";
    }
  },

  set(id) {
    if (!BIBLE_VERSIONS.some((x) => x.id === id)) return;
    try {
      localStorage.setItem(VERSION_KEY, id);
    } catch {
      /* best-effort */
    }
    window.dispatchEvent(new CustomEvent("bibflix:bible-version:change", { detail: id }));
  },

  // Resolve o texto a mostrar: se a preferência for "original" (ou a
  // referência/API não der certo), devolve originalText sem mudar nada.
  async resolveText(originalText, reference) {
    const versionId = this.get();
    if (versionId === "original") return originalText;
    const translated = await fetchVerseText(reference, versionId);
    return translated || originalText;
  },
};
