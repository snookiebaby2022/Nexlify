import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { streamProbeErrorWithHint } from "@/lib/stream-probe-fix-hints";
import {
  classifyProbeFailure,
  extractProviderCredentials,
  formatProbeFailure,
  type ProbeResult,
} from "@/lib/stream-provider-probe";
import { cacheGet, cacheSet } from "@/lib/cache";
import { resolveStreamPlaybackUrl } from "@/lib/resolve-stream-url";
import { sendTelegramAlert } from "@/lib/panel-telegram-alerts";
import { enqueueAgentCommand } from "@/lib/stream-agent";
import { findSiblingLiveBackupUrl } from "@/lib/live-channel-backup";
import {
  markDeadLinkProbeRun,
  probeStreamWithScheduler,
  PROBE_SCHEDULER_BUDGET_MS,
  runProbeBatchWithinBudget,
  shouldRunDeadLinkProbe,
} from "@/lib/source-probe-scheduler";

const PROBE_UA = "VLC/3.0.20 LibVLC/3.0.20";
const PROBE_CONNECT_MS = 8000;
const PROBE_UNSTABLE_MIN_MS = 5000;
const PROBE_UNSTABLE_MAX_MS = 8000;
const PROBE_DEAD_STREAK = 2;
const PROBE_RETRY_MS = 400;

type ProviderSlice = {
  providerType?: string | null;
  apiKey?: string | null;
  remoteUsername?: string | null;
  remotePassword?: string | null;
} | null;

type HealthState = "healthy" | "unstable" | "dead";

/** Xtream/XUI: ensure username+password are on the probe URL when not already in the path. */
function buildAuthenticatedProbeUrl(url: string, provider: ProviderSlice): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/\/(live|movie|series)\/[^/]+\/[^/]+\//i.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.searchParams.get("username") && u.searchParams.get("password")) return trimmed;
    const extracted = extractProviderCredentials(trimmed, provider?.apiKey);
    const username = provider?.remoteUsername?.trim() || extracted.username;
    const password = provider?.remotePassword?.trim() || extracted.password;
    if (username && password) {
      u.searchParams.set("username", username);
      u.searchParams.set("password", password);
      return u.toString();
    }
  } catch {
    /* keep original */
  }
  return trimmed;
}

/** 1-Stream Bearer / NXT X-API-Key / Xtream Basic when creds are not in the URL path. */
function buildProbeAuthHeaders(provider: ProviderSlice): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": PROBE_UA, Accept: "*/*" };
  const type = (provider?.providerType ?? "").toLowerCase();
  if (type === "onestream") {
    const [apiKey, apiToken] = (provider?.apiKey ?? "").split(/:([\s\S]*)/, 2);
    headers.Authorization = `Bearer ${apiKey}:${apiToken ?? ""}`;
  } else if (type === "nxt" && provider?.apiKey) {
    headers["X-API-Key"] = provider.apiKey;
  } else if (provider?.remoteUsername?.trim() && provider?.remotePassword?.trim()) {
    headers.Authorization = `Basic ${Buffer.from(
      `${provider.remoteUsername.trim()}:${provider.remotePassword.trim()}`
    ).toString("base64")}`;
  }
  return headers;
}

function providerProbeOpts(provider: ProviderSlice) {
  if (!provider) return {};
  return {
    providerType: provider.providerType,
    apiKey: provider.apiKey,
    remoteUsername: provider.remoteUsername,
    remotePassword: provider.remotePassword,
  };
}

/** HEAD blocked → GET with 1-byte range (many IPTV panels reject HEAD). */
async function fetchProbeWithFallback(
  url: string,
  headers: Record<string, string>
): Promise<ProbeResult> {
  const start = Date.now();
  try {
    let res: Response;
    let via: "head" | "get" = "head";
    try {
      res = await fetch(url, {
        method: "HEAD",
        headers,
        signal: AbortSignal.timeout(PROBE_CONNECT_MS),
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HEAD HTTP ${res.status}`);
    } catch {
      via = "get";
      res = await fetch(url, {
        method: "GET",
        headers: { ...headers, Range: "bytes=0-1" },
        signal: AbortSignal.timeout(PROBE_CONNECT_MS),
        redirect: "follow",
      });
    }
    const latencyMs = Date.now() - start;
    const code = res.status;
    if ((code >= 200 && code < 300) || code === 206) {
      return {
        status: "online",
        message: `${via === "get" ? "GET range" : "HEAD"} HTTP ${code} · ${latencyMs}ms`,
        httpStatus: code,
        latencyMs,
      };
    }
    const message =
      code === 401
        ? `401 Unauthorized · ${latencyMs}ms`
        : code === 403
          ? `403 Forbidden · ${latencyMs}ms`
          : code === 404
            ? `404 Not Found · ${latencyMs}ms`
            : code >= 500
              ? `Server error HTTP ${code} · ${latencyMs}ms`
              : `HTTP ${code} · ${latencyMs}ms`;
    return {
      status: code === 401 || code === 403 ? "degraded" : "offline",
      message,
      httpStatus: code,
      latencyMs,
      failureReason: classifyProbeFailure(message, code),
    };
  } catch (e) {
    const latencyMs = Date.now() - start;
    const message = e instanceof Error ? e.message : "Connection failed";
    return {
      status: "offline",
      message,
      latencyMs,
      failureReason: classifyProbeFailure(message),
    };
  }
}

function evaluateProbeOutcome(probe: ProbeResult, skipped: boolean): { ok: boolean; state: HealthState } {
  if (skipped) return { ok: false, state: "dead" };
  const ms = probe.latencyMs ?? 0;
  if (probe.status === "online") {
    if (ms >= PROBE_UNSTABLE_MIN_MS && ms <= PROBE_UNSTABLE_MAX_MS) {
      return { ok: true, state: "unstable" };
    }
    return { ok: true, state: "healthy" };
  }
  if (probe.status === "degraded") {
    return { ok: true, state: "unstable" };
  }
  return { ok: false, state: "dead" };
}

function probeErrorLabel(probe: ProbeResult, state: HealthState): string | null {
  if (state === "healthy") return null;
  const labeled = formatProbeFailure(probe);
  if (state === "unstable") {
    return streamProbeErrorWithHint(`[unstable] ${labeled}`);
  }
  return streamProbeErrorWithHint(labeled);
}

async function probeStreamForMonitoring(
  streamId: string,
  url: string,
  provider: ProviderSlice
): Promise<{ probe: ProbeResult; skipped: boolean }> {
  const target = buildAuthenticatedProbeUrl(url, provider);
  const headers = buildProbeAuthHeaders(provider);
  const opts = providerProbeOpts(provider);
  let last: { probe: ProbeResult; skipped: boolean } = {
    probe: { status: "offline", message: "Probe failed", failureReason: "error" },
    skipped: false,
  };

  for (let attempt = 0; attempt < PROBE_DEAD_STREAK; attempt++) {
    const result = await probeStreamWithScheduler({
      streamId,
      url: target,
      fast: true,
      ...opts,
    });
    const outcome = evaluateProbeOutcome(result.probe, result.skipped);
    if (outcome.ok || result.skipped) return result;
    last = result;
    if (attempt < PROBE_DEAD_STREAK - 1) {
      await new Promise((r) => setTimeout(r, PROBE_RETRY_MS));
    }
  }

  const fallback = await fetchProbeWithFallback(target, headers);
  if (fallback.status === "online" || fallback.status === "degraded") {
    return { probe: fallback, skipped: false };
  }
  return last;
}

export async function runDeadLinkProbeJob() {
  if (!(await shouldRunDeadLinkProbe())) return { probed: 0, failed: 0, restarted: 0, logged: 0, skipped: true };

  const settings = await getSettingGroup("streams");
  if (!settings.autoFixDeadLinks) return { probed: 0, failed: 0, restarted: 0, logged: 0, skipped: true };

  const savedProbeTimeout = process.env.STREAM_PROBE_TIMEOUT_MS;
  process.env.STREAM_PROBE_TIMEOUT_MS = savedProbeTimeout ?? String(PROBE_CONNECT_MS);

  const streams = await prisma.stream.findMany({
    where: { isActive: true, type: "LIVE" },
    include: { provider: true, server: true },
    take: 40,
    orderBy: [{ lastProbeAt: "asc" }, { updatedAt: "asc" }],
  });

  let failed = 0;
  let restarted = 0;
  let logged = 0;
  let probed = 0;

  try {
    await runProbeBatchWithinBudget(streams, PROBE_SCHEDULER_BUDGET_MS, async (stream) => {
      const primaryUrl = resolveStreamPlaybackUrl(stream);
      const provider = stream.provider ?? null;
      const { probe, skipped } = await probeStreamForMonitoring(stream.id, primaryUrl, provider);
      probed += 1;
      const { ok, state } = evaluateProbeOutcome(probe, skipped);

      if (!stream.backupUrl?.trim()) {
        const sibling = await findSiblingLiveBackupUrl(stream);
        if (sibling) {
          await prisma.stream.update({
            where: { id: stream.id },
            data: { backupUrl: sibling },
          });
          stream.backupUrl = sibling;
        }
      }

      if (!ok && state === "dead" && stream.backupUrl?.trim()) {
        const backupUrl = stream.backupUrl.trim();
        const backupResult = await probeStreamForMonitoring(stream.id, backupUrl, provider);
        const backupOutcome = evaluateProbeOutcome(backupResult.probe, backupResult.skipped);
        if (backupOutcome.ok) {
          await prisma.stream.update({
            where: { id: stream.id },
            data: {
              lastProbeAt: new Date(),
              lastProbeOk: true,
              lastProbeError: "Using backup URL (primary failed)",
            },
          });
          return;
        }
      }

      const streakKey = `probe:fail:streak:${stream.id}`;
      const prevStreak = Number((await cacheGet<number>(streakKey)) ?? 0);
      const streak = ok ? 0 : state === "dead" ? prevStreak + 1 : prevStreak;
      await cacheSet(streakKey, streak, 6 * 60 * 60);
      const markDead = state === "dead" && streak >= PROBE_DEAD_STREAK;

      await prisma.stream.update({
        where: { id: stream.id },
        data: {
          lastProbeAt: new Date(),
          lastProbeOk: ok ? true : state === "unstable" ? true : markDead ? false : stream.lastProbeOk,
          lastProbeError: probeErrorLabel(probe, state),
        },
      });

      if (state === "dead" && markDead) {
        failed++;
        logged++;
        const { getStreamPlaybackPolicy, streamPlaysInstantThroughServers } = await import(
          "@/lib/stream-playback-policy"
        );
        const forPolicy = {
          vodMode: stream.vodMode,
          isOnDemand: stream.isOnDemand,
          isCreatedChannel: stream.isCreatedChannel,
          agentStartCmd: stream.agentStartCmd,
          autoRestart: stream.autoRestart,
          streamUrl: stream.streamUrl,
          hostedExternally: stream.hostedExternally,
        };
        const skipFfmpegRestart =
          streamPlaysInstantThroughServers(forPolicy) || getStreamPlaybackPolicy(forPolicy) !== "transcode";
        if (stream.autoRestart && stream.serverId && stream.server?.agentToken && !skipFfmpegRestart) {
          await enqueueAgentCommand(stream.serverId, "restart_stream", { streamId: stream.id });
          restarted++;
        }
        if (stream.serverId && stream.server?.agentToken) {
          await enqueueAgentCommand(stream.serverId, "probe_stream", {
            streamId: stream.id,
            url: primaryUrl,
          }).catch(() => undefined);
        }
      }
    });

    await markDeadLinkProbeRun();
    return { probed, failed, restarted, logged, skipped: false };
  } finally {
    if (savedProbeTimeout === undefined) delete process.env.STREAM_PROBE_TIMEOUT_MS;
    else process.env.STREAM_PROBE_TIMEOUT_MS = savedProbeTimeout;
  }
}

export async function runTelegramMonitoringJob() {
  const settings = await getSettingGroup("monitoring");
  if (!settings.telegramAlertsEnabled) return { alerts: 0 };

  let alerts = 0;
  const offlineMinutes = Number(settings.offlineStreamMinutes ?? 5);
  const offlineCutoff = new Date(Date.now() - offlineMinutes * 60_000);

  const offlineServers = await prisma.streamServer.findMany({
    where: {
      isActive: true,
      agentToken: { not: null },
      OR: [{ agentLastSeen: { lt: offlineCutoff } }, { healthStatus: "offline" }],
    },
    take: 10,
  });

  if (settings.alertOfflineStreams && offlineServers.length) {
    const msg = `Nexlify alert: ${offlineServers.length} streaming server(s) offline or stale.`;
    const r = await sendTelegramAlert(msg);
    if (r.ok) alerts++;
  }

  const connThreshold = Number(settings.highLoadConnectionsThreshold ?? 500);
  const connCount = await prisma.liveConnection.count({
    where: { lastSeenAt: { gte: new Date(Date.now() - 120_000) } },
  });
  if (settings.alertHighLoad && connCount >= connThreshold) {
    const r = await sendTelegramAlert(
      `Nexlify alert: high load - ${connCount} active connections (threshold ${connThreshold}).`
    );
    if (r.ok) alerts++;
  }

  const deadStreams = await prisma.stream.count({
    where: { isActive: true, lastProbeOk: false, lastProbeAt: { gte: offlineCutoff } },
  });
  if (settings.alertAbuse && deadStreams >= 5) {
    const r = await sendTelegramAlert(`Nexlify alert: ${deadStreams} streams failed health probe.`);
    if (r.ok) alerts++;
  }

  return { alerts };
}
