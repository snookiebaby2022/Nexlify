/** Detect whether a VOD/series title is English vs foreign. */

export type TitleLanguage = {
  code: string;
  label: string;
  english: boolean;
  reason: "meta" | "script" | "category" | "name" | "default";
  confidence: "high" | "low";
};

const LANG_LABELS: Record<string, string> = {
  en: "English",
  eng: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ar: "Arabic",
  tr: "Turkish",
  hi: "Hindi",
  ur: "Urdu",
  pa: "Punjabi",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  ko: "Korean",
  ja: "Japanese",
  zh: "Chinese",
  cn: "Chinese",
  th: "Thai",
  vi: "Vietnamese",
  pl: "Polish",
  nl: "Dutch",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  el: "Greek",
  he: "Hebrew",
  fa: "Persian",
  uk: "Ukrainian",
  cs: "Czech",
  hu: "Hungarian",
  ro: "Romanian",
  id: "Indonesian",
  ms: "Malay",
  tl: "Filipino",
  fil: "Filipino",
};

const ENGLISH_CODES = new Set(["en", "eng", "english"]);

const FOREIGN_CATEGORY_RE =
  /\b(arabic|turkish|hindi|urdu|punjabi|bengali|tamil|telugu|malayalam|kannada|korean|japanese|chinese|thai|vietnamese|russian|polish|greek|hebrew|persian|farsi|bollywood|lollywood|nollywood|filipino|tagalog|latin[oa]?|spanish|french|german|italian|portuguese|brazilian|mexican|argentin|colombian|pakistani|indian(?!\s*ocean))\b/i;

const SCRIPT_TESTS: { re: RegExp; code: string }[] = [
  { re: /[\u0600-\u06FF]/, code: "ar" },
  { re: /[\u0400-\u04FF]/, code: "ru" },
  { re: /[\u3040-\u30FF]/, code: "ja" },
  { re: /[\uAC00-\uD7AF]/, code: "ko" },
  { re: /[\u4E00-\u9FFF]/, code: "zh" },
  { re: /[\u0E00-\u0E7F]/, code: "th" },
  { re: /[\u0900-\u097F]/, code: "hi" },
  { re: /[\u0980-\u09FF]/, code: "bn" },
  { re: /[\u0A00-\u0A7F]/, code: "pa" },
  { re: /[\u0590-\u05FF]/, code: "he" },
];

function normalizeLangCode(raw: unknown): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-].*$/, "");
  if (!s) return "";
  if (s === "english") return "en";
  return s.slice(0, 8);
}

export function languageLabel(code: string): string {
  const c = normalizeLangCode(code);
  if (!c) return "Unknown";
  return LANG_LABELS[c] ?? c.toUpperCase();
}

export function isEnglishLanguageCode(code: unknown): boolean {
  return ENGLISH_CODES.has(normalizeLangCode(code));
}

function languageFromMeta(meta?: Record<string, unknown> | null): string {
  if (!meta) return "";
  const keys = [
    "originalLanguage",
    "original_language",
    "tmdbOriginalLanguage",
    "language",
    "lang",
    "spokenLanguage",
  ];
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return normalizeLangCode(v);
    if (Array.isArray(v) && typeof v[0] === "string") return normalizeLangCode(v[0]);
  }
  const guid = String(meta.guid ?? meta.Guid ?? "");
  const m = guid.match(/[?&]lang=([a-z]{2,8})/i);
  if (m) return normalizeLangCode(m[1]);
  return "";
}

function languageFromScript(name: string): string {
  for (const { re, code } of SCRIPT_TESTS) {
    if (re.test(name)) return code;
  }
  return "";
}

export function detectTitleLanguage(
  name: string,
  opts?: {
    language?: string | null;
    categoryName?: string | null;
    meta?: Record<string, unknown> | null;
  }
): TitleLanguage {
  const fromMeta = normalizeLangCode(opts?.language) || languageFromMeta(opts?.meta);
  if (fromMeta) {
    return {
      code: fromMeta,
      label: languageLabel(fromMeta),
      english: isEnglishLanguageCode(fromMeta),
      reason: "meta",
      confidence: "high",
    };
  }
  const fromScript = languageFromScript(name);
  if (fromScript) {
    return {
      code: fromScript,
      label: languageLabel(fromScript),
      english: false,
      reason: "script",
      confidence: "high",
    };
  }
  const cat = String(opts?.categoryName ?? "");
  if (FOREIGN_CATEGORY_RE.test(name)) {
    return { code: "xx", label: "Foreign", english: false, reason: "name", confidence: "high" };
  }
  if (FOREIGN_CATEGORY_RE.test(cat)) {
    const asciiTitle = /^[\x20-\x7E]+$/.test(name) && name.trim().length > 0;
    return {
      code: "xx",
      label: "Foreign",
      english: false,
      reason: "category",
      confidence: asciiTitle ? "low" : "high",
    };
  }
  return { code: "en", label: "English", english: true, reason: "default", confidence: "high" };
}

export function isNonEnglishTitle(
  name: string,
  opts?: {
    language?: string | null;
    categoryName?: string | null;
    meta?: Record<string, unknown> | null;
  }
): boolean {
  return !detectTitleLanguage(name, opts).english;
}
