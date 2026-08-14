/** Panel URL shapes used when looking up License.panelUrl / calling remote-update. */

export function panelUrlCandidates(raw: string): string[] {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return [];
  const out: string[] = [];
  const add = (u: string) => {
    const n = u.replace(/\/$/, "");
    if (n && !out.includes(n)) out.push(n);
  };
  add(trimmed);
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const u = new URL(withProto);
    const host = u.host;
    add(`${u.protocol}//${host}`);
    add(`http://${host}`);
    add(`https://${host}`);
    if (host.startsWith("www.")) add(`${u.protocol}//${host.slice(4)}`);
  } catch {
    /* keep trimmed only */
  }
  return out;
}

export function preferReachablePanelUrls(raw: string): string[] {
  const candidates = panelUrlCandidates(raw);
  const ipLike = candidates.some((u) => /:\/\/(\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(u));
  if (!ipLike) return candidates;
  return [...candidates].sort((a, b) => Number(b.startsWith("http:")) - Number(a.startsWith("http:")));
}
