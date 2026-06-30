import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { getSettingGroup } from "@/lib/panel-settings";
import { prisma } from "@/lib/prisma";

export async function logLeakAudit(opts: {
  lineId?: string;
  streamId?: string;
  ip?: string;
  userAgent?: string;
  fingerprint?: string;
  action: string;
  meta?: Record<string, unknown>;
}) {
  const fp = await getSettingGroup("fingerprint");
  if (!fp.leakAuditEnabled) return;
  await prisma.leakAuditLog.create({
    data: {
      lineId: opts.lineId ?? null,
      streamId: opts.streamId ?? null,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent?.slice(0, 512) ?? null,
      fingerprint: opts.fingerprint ?? null,
      action: opts.action,
      meta: opts.meta ? (opts.meta as Prisma.InputJsonValue) : undefined,
    },
  });
}

export async function applyPlaybackFingerprint(
  url: string,
  ctx: { lineId: string; streamId?: string; clientIp?: string; userAgent?: string }
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

  void logLeakAudit({
    lineId: ctx.lineId,
    streamId: ctx.streamId,
    ip: ctx.clientIp,
    userAgent: ctx.userAgent,
    fingerprint: sig,
    action: "playback_url_signed",
  });

  if (url.startsWith("http")) {
    const real = new URL(url);
    real.searchParams.set("fp", sig);
    return real.toString();
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}fp=${sig}`;
}
