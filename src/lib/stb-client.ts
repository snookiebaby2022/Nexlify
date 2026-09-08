/** MAG / StbEmu / Infomir portal clients. Keep this file free of Prisma — middleware imports it. */
export function isStbUserAgent(ua: string | null | undefined): boolean {
  const s = (ua ?? "").toLowerCase();
  if (!s.trim()) return false;
  return /stbemu|stbapp|mag\d{3}|infomir|stalker|android.?tv|portalclient|tvip/i.test(s);
}

export function isStbPortalDocumentRequest(req: {
  method: string;
  headers: { get(name: string): string | null };
}): boolean {
  if (req.method !== "GET") return false;
  if (isStbUserAgent(req.headers.get("user-agent"))) return true;
  if (req.headers.get("x-user-agent")) return true;
  return false;
}
