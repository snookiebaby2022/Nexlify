import { existsSync } from "node:fs";
import { getSettingGroup, setSettingGroup } from "@/lib/panel-settings";
import { persistPlaybackTopologyFiles } from "@/lib/playback-topology-persist";
import { parsePlaybackTopology } from "@/lib/playback-topology";

const SPLICE_STATUS = new Set([502, 504, 521, 522, 523]);
const SPLICE_RE = /upstream\s+(502|504|521)|bad gateway|splice|502 loop|connection timed out while connecting to upstream/i;

export function playbackFailKind(
  detail?: string | null,
  status?: number | null
): "splice" | "viewer" {
  if (status != null && SPLICE_STATUS.has(Number(status))) return "splice";
  if (SPLICE_RE.test(String(detail ?? ""))) return "splice";
  return "viewer";
}

/**
 * Historic XUI migration helper: forced LIVE+ON_DEMAND → LIVE on every boot.
 * That kept undoing operator "on demand" settings after panel restarts.
 * Disabled — vodMode / isOnDemand are operator-owned.
 */
export async function backfillLiveOnDemandToLive(): Promise<number> {
  return 0;
}

/** Lock file / env means this host must not run local iptv-edge. */
export async function healPlaybackTopologyFromDisk(): Promise<void> {
  const locked =
    existsSync("/etc/nexlify/live-routing.lock") ||
    existsSync("/etc/nexlify/server-45-protected") ||
    process.env.NEXLIFY_PANEL_NO_IPTV_EDGE === "1";
  if (!locked) return;

  const server = await getSettingGroup("server");
  const current = parsePlaybackTopology(server.playbackTopology);
  const remote =
    String(server.remoteLiveUpstream ?? "").trim() ||
    String(process.env.NEXLIFY_REMOTE_EDGE ?? "").trim();
  if (current === "remote-splice" || current === "multi-lb") {
    persistPlaybackTopologyFiles({
      topology: current,
      remoteLiveUpstream: remote,
      repoPath: String(server.repoPath ?? ""),
    });
    return;
  }
  await setSettingGroup("server", {
    ...server,
    playbackTopology: "remote-splice",
    ...(remote ? { remoteLiveUpstream: remote } : {}),
  });
  persistPlaybackTopologyFiles({
    topology: "remote-splice",
    remoteLiveUpstream: remote,
    repoPath: String(server.repoPath ?? ""),
  });
}

export async function ensureLivePlaybackContract(): Promise<void> {
  // Intentionally does not rewrite stream on-demand flags (see backfillLiveOnDemandToLive).
  await healPlaybackTopologyFromDisk().catch(() => undefined);
}
