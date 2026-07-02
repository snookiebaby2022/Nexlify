import crypto from "crypto";
import { getSettingGroup } from "@/lib/panel-settings";

export async function appendPlaybackToken(
  url: string,
  ctx: { lineId: string; streamId?: string }
): Promise<string> {
  const streams = await getSettingGroup("streams");
  const ttlSec = Number(streams.playbackTokenTtlSec ?? 0);
  if (!ttlSec || ttlSec <= 0) return url;

  const secret =
    process.env.PLAYBACK_TOKEN_SECRET ??
    String((await getSettingGroup("fingerprint")).secret ?? "") ??
    process.env.JWT_SECRET ??
    "nexlify-playback";

  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${ctx.lineId}|${ctx.streamId ?? ""}|${exp}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 24);
  const token = Buffer.from(`${exp}.${sig}`).toString("base64url");

  if (url.startsWith("http")) {
    const u = new URL(url);
    u.searchParams.set("pt", token);
    return u.toString();
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}pt=${token}`;
}

export function verifyPlaybackToken(
  token: string,
  ctx: { lineId: string; streamId?: string },
  secret: string
): boolean {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [expStr, sig] = decoded.split(".");
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const payload = `${ctx.lineId}|${ctx.streamId ?? ""}|${exp}`;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 24);
    return sig === expected;
  } catch {
    return false;
  }
}
