/** Prefer host when DB name is a bogus migration label (e.g. XUI version "1.5.13"). */
export function streamServerDisplayName(name: string, host: string): string {
  const n = (name ?? "").trim();
  const h = (host ?? "").trim();
  if (!n) return h || "Server";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(n)) return n;
  if (/^\d+\.\d+(\.\d+)?([.\d]*)?$/.test(n)) return h || n;
  return n;
}
