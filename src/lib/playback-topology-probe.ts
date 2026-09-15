import { prisma } from "@/lib/prisma";
import { parsePlaybackTopology, type PlaybackTopology } from "@/lib/playback-topology";
import { buildServerRoleContext, resolveServerRole } from "@/lib/ensure-main-server-online";
import { isServerHealthOnline } from "@/lib/server-tree";
import { getSettingGroup } from "@/lib/panel-settings";

export type TopologyCheck = {
  id: string;
  label: string;
  ok: boolean;
  severity: "info" | "warn" | "critical";
  hint: string;
};

export type PlaybackTopologyReport = {
  topology: PlaybackTopology | null;
  panelMediaBlockedExpected: boolean;
  streamHost: string | null;
  streamPort: string | null;
  onlineLbCount: number;
  totalLbCount: number;
  checks: TopologyCheck[];
  ok: boolean;
};

function envTopology(): PlaybackTopology | null {
  return (
    parsePlaybackTopology(process.env.PLAYBACK_TOPOLOGY) ??
    parsePlaybackTopology(process.env.NEXLIFY_PLAYBACK_TOPOLOGY)
  );
}

async function probeHttp(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; detail: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: { "User-Agent": "NexlifyTopologyProbe/1.0" },
      redirect: "manual",
    });
    return { ok: res.ok || res.status === 502, status: res.status, detail: `HTTP ${res.status}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return { ok: false, status: 0, detail: msg };
  } finally {
    clearTimeout(timer);
  }
}

/** Operator-facing playback wiring checks (panel API vs media edge). */
export async function getPlaybackTopologyReport(opts?: {
  probeEdgeHealth?: boolean;
  panelOrigin?: string;
}): Promise<PlaybackTopologyReport> {
  const topology = envTopology() ?? "remote-splice";
  const streams = await getSettingGroup("streams");
  const mediaOrigin = String(process.env.NEXLIFY_MEDIA_ORIGIN ?? "").trim();
  let streamHost: string | null = null;
  let streamPort = String(streams.streamHttpPort ?? "8080").trim() || "8080";
  if (mediaOrigin) {
    try {
      const u = new URL(mediaOrigin.includes("://") ? mediaOrigin : `http://${mediaOrigin}`);
      streamHost = u.hostname;
      if (u.port) streamPort = u.port;
    } catch {
      streamHost = mediaOrigin.replace(/^https?:\/\//, "").split("/")[0].split(":")[0] || null;
    }
  }

  const servers = await prisma.streamServer.findMany({
    where: { isActive: true },
    select: { id: true, name: true, host: true, healthStatus: true, panelSettings: true, sortOrder: true },
  });
  const ctx = buildServerRoleContext(servers);
  const lbs = servers.filter((s) => resolveServerRole(s, ctx) === "lb");
  const onlineLbCount = lbs.filter((s) => isServerHealthOnline(s.healthStatus)).length;
  if (!streamHost && lbs.length) {
    const pick = lbs.find((s) => isServerHealthOnline(s.healthStatus)) ?? lbs[0];
    streamHost = pick?.host?.trim() || null;
  }

  const checks: TopologyCheck[] = [];

  checks.push({
    id: "stream-host",
    label: "Stream hostname configured (server_info.url)",
    ok: Boolean(streamHost),
    severity: streamHost ? "info" : "critical",
    hint: streamHost
      ? `Clients play on ${streamHost}:${streamPort}`
      : "Set Settings → Streaming → primary stream host / LB domain",
  });

  checks.push({
    id: "lb-online",
    label: "At least one load-balancer / edge online",
    ok: onlineLbCount > 0,
    severity: onlineLbCount > 0 ? "info" : "critical",
    hint:
      onlineLbCount > 0
        ? `${onlineLbCount}/${lbs.length} LB(s) online`
        : "Install stream agent on edge; mark server active",
  });

  const panelMediaBlockedExpected =
    topology === "remote-splice" || topology === "multi-lb" || process.env.PANEL_BLOCK_MEDIA_PATHS === "1";

  if (panelMediaBlockedExpected && opts?.panelOrigin) {
    const origin = opts.panelOrigin.replace(/\/+$/, "");
    const liveProbe = await probeHttp(`${origin}/live/_topology_probe/_probe/0.ts`, 8000);
    const blocked = liveProbe.status === 502;
    checks.push({
      id: "panel-no-media",
      label: "Panel refuses local /live/ (502 expected)",
      ok: blocked,
      severity: blocked ? "info" : "warn",
      hint: blocked
        ? "Media correctly offloaded — apps must use server_info.url"
        : `Panel returned ${liveProbe.detail}; live bytes may hairpin through Next`,
    });
  }

  if (opts?.probeEdgeHealth && streamHost) {
    const proto = mediaOrigin.startsWith("https") ? "https" : "http";
    const edgeHealth = await probeHttp(`${proto}://${streamHost}:${streamPort}/edge/health`, 8000);
    checks.push({
      id: "edge-health",
      label: "Edge /edge/health reachable",
      ok: edgeHealth.ok && edgeHealth.status === 200,
      severity: edgeHealth.status === 200 ? "info" : "warn",
      hint: edgeHealth.detail,
    });
  }

  const secretOk = Boolean(
    process.env.PANEL_INTERNAL_SECRET?.trim() ||
      process.env.NEXLIFY_PANEL_API_SECRET?.trim() ||
      process.env.PANEL_API_SECRET?.trim(),
  );
  checks.push({
    id: "internal-secret",
    label: "Panel internal secret configured (edge live-auth)",
    ok: secretOk,
    severity: secretOk ? "info" : "critical",
    hint: secretOk ? "Edge can authenticate playback" : "Set PANEL_INTERNAL_SECRET in panel .env",
  });

  const ok = checks.every((c) => c.ok || c.severity === "info");
  return {
    topology,
    panelMediaBlockedExpected,
    streamHost,
    streamPort,
    onlineLbCount,
    totalLbCount: lbs.length,
    checks,
    ok,
  };
}
