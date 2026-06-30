/** Policy-safe entertainment keywords for ads, LPs, and organic (avoid IPTV-reseller ad policy flags). */
export const ENTERTAINMENT_AD_KEYWORDS = [
  "live tv streaming service",
  "watch live sports online",
  "hd streaming player app",
  "premium digital entertainment",
  "cut the cord streaming",
] as const;

export type EntertainmentAdKeyword = (typeof ENTERTAINMENT_AD_KEYWORDS)[number];

export function withEntertainmentKeywords(keywords: string[] = []): string[] {
  return [...new Set([...ENTERTAINMENT_AD_KEYWORDS, ...keywords])];
}

/** Meta description weaving entertainment keywords (≤160 chars). */
export function entertainmentAdDescription(sentence: string): string {
  if (sentence.length <= 160) return sentence;
  return `${sentence.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}
