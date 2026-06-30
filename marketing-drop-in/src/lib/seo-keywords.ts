/** Core keywords — weave into titles and meta descriptions on indexable pages. */
export const CORE_SEO_KEYWORDS = [
  "IPTV reseller panel",
  "WHMCS IPTV module",
  "IPTV management software",
] as const;

export type CoreSeoKeyword = (typeof CORE_SEO_KEYWORDS)[number];

/** Merge core keywords into a page keyword list without duplicates. */
export function withCoreKeywords(keywords: string[] = []): string[] {
  return [...new Set([...CORE_SEO_KEYWORDS, ...keywords])];
}

/**
 * Ensure all three core keywords appear in a meta description (≤160 chars target).
 * Trims intelligently when over limit.
 */
export function coreKeywordDescription(sentence: string): string {
  const lower = sentence.toLowerCase();
  let text = sentence.trim();

  for (const kw of CORE_SEO_KEYWORDS) {
    if (!lower.includes(kw.toLowerCase())) {
      const addition = text.endsWith(".") ? ` ${kw}.` : `. ${kw}.`;
      text += addition;
    }
  }

  if (text.length <= 160) return text;

  const trimmed = text.slice(0, 157).replace(/\s+\S*$/, "");
  return `${trimmed}…`;
}
