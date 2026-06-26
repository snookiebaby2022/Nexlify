import crypto from "crypto";
import { getSettingGroup } from "@/lib/panel-settings";

export async function applyPlaybackFingerprint(
  url: string,
  ctx: { lineId: string; clientIp?: string; userAgent?: string }
): Promise<string> {
  const fp = await getSettingGroup("fingerprint");
  if (!fp.enabled || !fp.secret) return url;

  const parts = [ctx.lineId];
  if (fp.includeClientIp && ctx.clientIp) parts.push(ctx.clientIp);
  if (fp.includeUserAgent && ctx.userAgent) parts.push(ctx.userAgent);

  const algo = fp.algorithm === "md5" ? "md5" : "sha256";
  const sig = crypto
    .createHmac(algo, String(fp.secret))
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 16);

  if (url.startsWith("http")) {
    const real = new URL(url);
    real.searchParams.set("fp", sig);
    return real.toString();
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}fp=${sig}`;
}
