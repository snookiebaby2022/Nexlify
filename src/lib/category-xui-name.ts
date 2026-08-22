/**
 * XUI / Ministra category folder naming: `UK | Entertainment`, `US | Fubo`, `XXX | …`
 * Used on import, repair, and when creating categories in the panel.
 */

const REGION_CANON: Record<string, string> = {
  uk: "UK",
  us: "US",
  usa: "US",
  ie: "IE",
  ireland: "IE",
  irish: "IE",
  au: "AU",
  australia: "AU",
  australian: "AU",
  ca: "CA",
  canada: "CA",
  canadian: "CA",
  de: "DE",
  german: "DE",
  germany: "DE",
  fr: "FR",
  french: "FR",
  france: "FR",
  it: "IT",
  italian: "IT",
  italy: "IT",
  es: "ES",
  spanish: "ES",
  spain: "ES",
  pl: "PL",
  polish: "PL",
  poland: "PL",
  tr: "TR",
  turkish: "TR",
  turkey: "TR",
  nl: "NL",
  dutch: "NL",
  netherlands: "NL",
  pt: "PT",
  portuguese: "PT",
  portugal: "PT",
  bg: "BG",
  bulgarian: "BG",
  bulgaria: "BG",
  ro: "RO",
  romanian: "RO",
  romania: "RO",
  ar: "AR",
  arabic: "AR",
  al: "AL",
  albanian: "AL",
  albania: "AL",
  ir: "IR",
  iran: "IR",
  gr: "GR",
  greek: "GR",
  za: "ZA",
  african: "African",
  africa: "African",
  in: "IN",
  indian: "IN",
  pk: "PK",
  pakistani: "PK",
  ph: "PH",
  filipino: "PH",
  jp: "JP",
  japanese: "JP",
  hk: "HK",
  my: "MY",
  nz: "NZ",
  cn: "CN",
  chinese: "CN",
  kr: "KR",
  korean: "KR",
  th: "TH",
  thai: "TH",
  vn: "VN",
  vietnamese: "VN",
  mx: "MX",
  mexican: "MX",
  br: "BR",
  brazilian: "BR",
  latino: "Latino",
  international: "International",
  scandinavian: "Scandinavian",
  balkan: "Balkan",
  xxx: "XXX",
  adult: "XXX",
};

/** Longest-first prefix rules for names without a pipe. */
const REGION_PREFIX_RULES: { re: RegExp; region: string }[] = [
  { re: /^international\s+/i, region: "International" },
  { re: /^australian\s+/i, region: "AU" },
  { re: /^canadian\s+/i, region: "CA" },
  { re: /^scandinavian\s+/i, region: "Scandinavian" },
  { re: /^balkan\s+/i, region: "Balkan" },
  { re: /^romanian\s+/i, region: "RO" },
  { re: /^bulgarian\s+/i, region: "BG" },
  { re: /^portuguese\s+/i, region: "PT" },
  { re: /^netherlands\s+/i, region: "NL" },
  { re: /^dutch\s+/i, region: "NL" },
  { re: /^german\s+/i, region: "DE" },
  { re: /^french\s+/i, region: "FR" },
  { re: /^spanish\s+/i, region: "ES" },
  { re: /^italian\s+/i, region: "IT" },
  { re: /^polish\s+/i, region: "PL" },
  { re: /^turkish\s+/i, region: "TR" },
  { re: /^arabic\s+/i, region: "AR" },
  { re: /^indian\s+/i, region: "IN" },
  { re: /^pakistani\s+/i, region: "PK" },
  { re: /^filipino\s+/i, region: "PH" },
  { re: /^mexican\s+/i, region: "MX" },
  { re: /^brazilian\s+/i, region: "BR" },
  { re: /^latino\s+/i, region: "Latino" },
  { re: /^african\s+/i, region: "African" },
  { re: /^irish\s+/i, region: "IE" },
  { re: /^ireland\s+/i, region: "IE" },
  { re: /^uk\s+/i, region: "UK" },
  { re: /^us\s+/i, region: "US" },
  { re: /^usa\s+/i, region: "US" },
  { re: /^ie\s+/i, region: "IE" },
  { re: /^au\s+/i, region: "AU" },
  { re: /^ca\s+/i, region: "CA" },
  { re: /^de\s+/i, region: "DE" },
  { re: /^fr\s+/i, region: "FR" },
  { re: /^it\s+/i, region: "IT" },
  { re: /^es\s+/i, region: "ES" },
  { re: /^pl\s+/i, region: "PL" },
  { re: /^tr\s+/i, region: "TR" },
  { re: /^nl\s+/i, region: "NL" },
  { re: /^pt\s+/i, region: "PT" },
  { re: /^xxx\s+/i, region: "XXX" },
  { re: /^adult\s+/i, region: "XXX" },
];

/** Common unprefixed IPTV folder names → region hint. */
const BRAND_REGION_HINTS: { re: RegExp; region: string }[] = [
  { re: /^(sky sports|tnt sports|bbc|itv\b|channel 4|channel 5|uk channels|uk entertainment|uk documentary|uk regionals|uk movies|premier sports|spfl|dazn uk|discovery\+ uk)/i, region: "UK" },
  { re: /^(fubo|espn|nfl\b|nba\b|mlb\b|nhl\b|hulu|us entertainment|us sports|us movies|us locals|big 10|sportsnet|cbc regional)/i, region: "US" },
  { re: /^(kayo|optus|stan sport|afl\b|nrl\b)/i, region: "AU" },
  { re: /^(xxx|adult\b)/i, region: "XXX" },
];

function cleanTail(tail: string): string {
  return tail.replace(/\s+/g, " ").trim();
}

export function canonicalCategoryRegion(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return "";
  return REGION_CANON[key] ?? raw.trim().replace(/\s+/g, " ").toUpperCase();
}

function composeXuiName(region: string, tail: string): string {
  const r = canonicalCategoryRegion(region);
  const t = cleanTail(tail);
  if (!r) return t;
  if (!t) return `${r} |`;
  return `${r} | ${t}`;
}

export type FormatXuiCategoryNameOptions = {
  isAdult?: boolean;
};

/**
 * Normalize a category folder name to XUI pipe format when a region can be inferred.
 * Already-piped names get spacing/region canonicalization only.
 */
export function formatXuiCategoryName(
  name: string,
  opts?: FormatXuiCategoryNameOptions
): string {
  let n = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!n) return n;

  if (opts?.isAdult || /^(xxx|adult)(\s|\||$)/i.test(n)) {
    const tail = cleanTail(n.replace(/^(xxx|adult)\s*[\|]?\s*/i, ""));
    return tail ? `XXX | ${tail}` : "XXX |";
  }

  if (n.includes("|")) {
    const idx = n.indexOf("|");
    const regionRaw = n.slice(0, idx).trim();
    const tailRaw = n.slice(idx + 1).trim();
    return composeXuiName(regionRaw, tailRaw);
  }

  for (const { re, region } of REGION_PREFIX_RULES) {
    const m = n.match(re);
    if (m) {
      return composeXuiName(region, n.slice(m[0].length));
    }
  }

  for (const { re, region } of BRAND_REGION_HINTS) {
    if (re.test(n)) {
      return composeXuiName(region, n);
    }
  }

  return n;
}

export function isXuiPipeCategoryName(name: string): boolean {
  return /\s\|\s/.test(String(name ?? ""));
}

export function preferXuiCategoryName(a: string, b: string): string {
  const fa = formatXuiCategoryName(a);
  const fb = formatXuiCategoryName(b);
  const aPipe = fa.includes("|");
  const bPipe = fb.includes("|");
  if (aPipe && !bPipe) return fa;
  if (bPipe && !aPipe) return fb;
  return fa.length <= fb.length ? fa : fb;
}
