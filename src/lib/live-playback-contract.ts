import { existsSync } from "node:fs";
import { StreamType, VodMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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

/** Imported XUI ON_DEMAND on LIVE forces HLS packager — flip to splice LIVE. */
export async function backfillLiveOnDemandToLive(): Promise<number> {
  const result = await prisma.stream.updateMany({
    where: { type: StreamType.LIVE, vodMode: VodMode.ON_DEMAND },
    data: { vodMode: VodMode.LIVE, isOnDemand: false, autoRestart: false },
  });
  return result.count;
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
  const n = await backfillLiveOnDemandToLive().catch(() => 0);
  if (n > 0) console.log(`[live-contract] flipped ${n} LIVE ON_DEMAND row(s) to LIVE`);
  await healPlaybackTopologyFromDisk().catch(() => undefined);
}
