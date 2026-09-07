import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { getSettingGroup } from "@/lib/panel-settings";
import { prisma } from "@/lib/prisma";
import { secretsEqual } from "@/lib/secrets-equal";
import { appendPlaybackToken } from "@/lib/playback-token";
import { listPanelPublicHostnames } from "@/lib/panel-public-hosts";

/** True only for URLs that belong to this panel — never provider upstreams. */
export async function isPanelPlaybackUrl(url: string): Promise<boolean> {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return false;
  if (!/^https?:\/\//i.test(trimmed)) {
    return /^\/(live|movie|series|timeshift)\//i.test(trimmed);
  }
  let host: string;
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  const names = new Set((await listPanelPublicHostnames()).map((h) => h.toLowerCase()));
  try {
    const server = await getSettingGroup("server");
    const panelUrl = String(server.serverUrl ?? "").trim();
    if (panelUrl) names.add(new URL(panelUrl).hostname.toLowerCase());
  } catch {
    /* ignore */
  }
  return names.has(host);
}

export function playbackFingerprintAlgo(raw: unknown): "sha256" | "sha1" | "md5" {
  const a = String(raw ?? "sha256").toLowerCase();
  if (a === "sha1") return "sha1";
  if (a === "md5") return "md5";
  return "sha256";
}

export function computePlaybackFingerprint(
  secret: string,
  algorithm: unknown,
  parts: string[]
): string {
  return crypto
    .createHmac(playbackFingerprintAlgo(algorithm), String(secret))
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 16);
}

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

export async function verifyPlaybackFingerprint(
  sig: string,
  ctx: { lineId: string; clientIp?: string; userAgent?: string }
): Promise<boolean> {
  const fp = await getSettingGroup("fingerprint");
  if (!fp.enabled || !fp.secret) return true;
  const parts = [ctx.lineId];
  if (fp.includeClientIp && ctx.clientIp) parts.push(ctx.clientIp);
  if (fp.includeUserAgent && ctx.userAgent) parts.push(ctx.userAgent);
  const expected = computePlaybackFingerprint(String(fp.secret), fp.algorithm, parts);
  return secretsEqual(String(sig).trim(), expected);
}

function appendQuery(url: string, key: string, value: string): string {
  if (url.startsWith("http")) {
    const real = new URL(url);
    real.searchParams.set(key, value);
    return real.toString();
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${key}=${value}`;
}

export async function applyPlaybackFingerprint(
  url: string,
  ctx: { lineId: string; streamId?: string; clientIp?: string; userAgent?: string }
): Promise<string> {
  const fp = await getSettingGroup("fingerprint");
  if (!fp.enabled || !fp.secret) {
    return signPanelPlaybackToken(url, ctx);
  }

  const parts = [ctx.lineId];
  if (fp.includeClientIp && ctx.clientIp) parts.push(ctx.clientIp);
  if (fp.includeUserAgent && ctx.userAgent) parts.push(ctx.userAgent);
  const sig = computePlaybackFingerprint(String(fp.secret), fp.algorithm, parts);

  void logLeakAudit({
    lineId: ctx.lineId,
    streamId: ctx.streamId,
    ip: ctx.clientIp,
    userAgent: ctx.userAgent,
    fingerprint: sig,
    action: "playback_url_signed",
  });

  // Never stamp provider upstreams — Xtream apps auth on /live/user/pass/id,
  // and extra query params on the source URL break many origins.
  if (await isPanelPlaybackUrl(url)) {
    url = appendQuery(url, "fp", sig);
  }
  return signPanelPlaybackToken(url, ctx);
}

async function signPanelPlaybackToken(
  url: string,
  ctx: { lineId: string; streamId?: string }
): Promise<string> {
  if (!(await isPanelPlaybackUrl(url))) return url;
  return appendPlaybackToken(url, ctx);
}
