/** Allow only http(s) URLs (or same-origin paths) for operator-supplied hrefs / img src. */
export function sanitizeHttpUrl(raw: string | null | undefined): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (text.startsWith("/") && !text.startsWith("//") && !text.includes("\\")) {
    return text;
  }
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
