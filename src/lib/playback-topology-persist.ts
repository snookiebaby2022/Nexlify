import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  parsePlaybackTopology,
  panelMustNotRunLocalIptvEdge,
  type PlaybackTopology,
} from "./playback-topology";

const TOPOLOGY_FILE = "/etc/nexlify/playback-topology";

export function playbackTopologyFromSettings(server: Record<string, unknown>): PlaybackTopology {
  return parsePlaybackTopology(server.playbackTopology) ?? "local-edge";
}

export function persistPlaybackTopologyFiles(opts: {
  topology: PlaybackTopology;
  remoteLiveUpstream?: string;
  repoPath?: string;
}): void {
  const lines = [opts.topology];
  const remote = String(opts.remoteLiveUpstream ?? "").trim();
  if (remote) lines.push(remote);
  const body = `${lines.join("\n")}\n`;
  try {
    mkdirSync("/etc/nexlify", { recursive: true });
    writeFileSync(TOPOLOGY_FILE, body, { encoding: "utf8" });
  } catch {
    /* Windows / no root */
  }
  const repo = String(opts.repoPath ?? process.cwd()).trim() || process.cwd();
  try {
    writeFileSync(path.join(repo, ".playback-topology"), body, { encoding: "utf8" });
  } catch {
    /* ignore */
  }
  upsertDotEnv(repo, {
    NEXLIFY_PLAYBACK_TOPOLOGY: opts.topology,
    NEXLIFY_LIVE_EDGE_MODE: opts.topology === "local-edge" ? "local" : "remote",
    NEXLIFY_PANEL_NO_IPTV_EDGE: opts.topology === "local-edge" ? "0" : "1",
    ...(remote ? { NEXLIFY_REMOTE_EDGE: remote } : {}),
  });
}

function upsertDotEnv(repo: string, pairs: Record<string, string>) {
  const envPath = path.join(repo, ".env");
  if (!existsSync(envPath)) return;
  let raw = readFileSync(envPath, "utf8");
  if (raw.includes("\r\n")) raw = raw.replace(/\r\n/g, "\n");
  let lines = raw.split("\n");
  for (const [key, value] of Object.entries(pairs)) {
    const prefix = `${key}=`;
    let found = false;
    lines = lines.map((line) => {
      if (line.startsWith(prefix)) {
        found = true;
        return `${key}="${value}"`;
      }
      return line;
    });
    if (!found) lines.push(`${key}="${value}"`);
  }
  try {
    writeFileSync(envPath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
  } catch {
    /* ignore */
  }
}

export { panelMustNotRunLocalIptvEdge };
