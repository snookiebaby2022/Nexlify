/** Vendor panel archives must be HTTPS on nexlify.live /downloads/. */
export function isAllowedPanelArchiveUrl(raw: string | null | undefined): boolean {
  const text = String(raw ?? "").trim();
  if (!text) return false;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (host !== "nexlify.live" && host !== "www.nexlify.live") return false;
    return url.pathname.startsWith("/downloads/");
  } catch {
    return false;
  }
}
