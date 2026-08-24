const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape text for safe HTML insertion (MAG portal, admin previews). */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch] ?? ch);
}

/** Strip control chars and trim — safe for usernames, search terms, labels. */
export function sanitizePlainText(value: unknown, maxLen = 512): string {
  return String(value ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLen);
}

/** JSON-safe string for embedding in script tags / attributes. */
export function sanitizeJsonString(value: unknown): string {
  return JSON.stringify(String(value ?? "")).slice(1, -1);
}
