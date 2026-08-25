import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import {
  getPanelServerSettings,
  parsePanelServerSettings,
  persistServerPortsToEnv,
  syncPanelServerEnv,
  type PanelServerSettings,
} from "@/lib/panel-server";
import { resolvePanelRepoPathSync } from "@/lib/panel-repo-path";
import { getSettingGroup, setSettingGroup } from "@/lib/panel-settings";
import type { ServerPortProfile } from "@/lib/panel-local-server";

const execFileAsync = promisify(execFile);

export type PortSyncResult = {
  ok: boolean;
  message: string;
  output: string;
};

function upsertEnvLine(lines: string[], key: string, value: string): string[] {
  const prefix = `${key}=`;
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  return next;
}

function portListEnv(ports: number[]): string {
  return ports.filter((p) => p >= 1 && p <= 65535).join(",");
}

/** Write stream / SSL / RTMP / extra listen ports to .env for nginx + UFW scripts. */
export async function persistExtendedPortsToEnv(
  settings: PanelServerSettings,
  profile?: Pick<
    ServerPortProfile,
    "rtmpPort" | "httpExtraPorts" | "httpsExtraPorts"
  >
): Promise<void> {
  await persistServerPortsToEnv(settings);
  const envPath = path.join(resolvePanelRepoPathSync(settings.repoPath), ".env");
  if (!fs.existsSync(envPath)) return;

  let raw = fs.readFileSync(envPath, "utf8");
  if (raw.includes("\r\n")) raw = raw.replace(/\r\n/g, "\n");

  let lines = raw.split("\n");
  if (profile) {
    lines = upsertEnvLine(lines, "RTMP_PORT", String(profile.rtmpPort));
    lines = upsertEnvLine(lines, "STREAM_HTTP_EXTRA_PORTS", portListEnv(profile.httpExtraPorts));
    lines = upsertEnvLine(lines, "STREAM_HTTPS_EXTRA_PORTS", portListEnv(profile.httpsExtraPorts));
  }

  fs.writeFileSync(envPath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

function portListsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort((x, y) => x - y);
  const bs = [...b].sort((x, y) => x - y);
  return as.every((n, i) => n === bs[i]);
}

function envPortList(key: string): number[] {
  return (process.env[key] ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 65535);
}

function localPortProfileUnchanged(
  settings: PanelServerSettings,
  profile: ServerPortProfile
): boolean {
  const rtmp = Number(process.env.RTMP_PORT ?? 1935);
  return (
    settings.streamHttpPort === profile.streamHttpPort &&
    settings.streamHttpsPort === profile.streamHttpsPort &&
    settings.panelSslPort === profile.panelSslPort &&
    rtmp === profile.rtmpPort &&
    portListsEqual(envPortList("STREAM_HTTP_EXTRA_PORTS"), profile.httpExtraPorts) &&
    portListsEqual(envPortList("STREAM_HTTPS_EXTRA_PORTS"), profile.httpsExtraPorts)
  );
}

export async function runPortSyncScript(): Promise<PortSyncResult> {
  const repo = resolvePanelRepoPathSync(process.env.PANEL_REPO_PATH);
  const script = path.join(repo, "scripts", "sync-panel-ports.sh");
  if (!fs.existsSync(script)) {
    return {
      ok: true,
      message: "Port sync skipped — panel install scripts were not found.",
      output: `looked for ${script}`,
    };
  }
  try {
    const { stdout, stderr } = await execFileAsync("bash", ["scripts/sync-panel-ports.sh"], {
      cwd: repo,
      timeout: 180_000,
      env: {
        ...process.env,
        PANEL_REPO_PATH: repo,
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      },
    });
    const output = (stdout || stderr || "").trim();
    return {
      ok: true,
      message: "Ports synced — nginx stream edge, RTMP, and firewall updated.",
      output: output.slice(0, 8000),
    };
  } catch (e) {
    const err = e as { message?: string; stdout?: string; stderr?: string };
    const output = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n").trim();
    return {
      ok: false,
      message: "Port sync failed — run on the server: sudo bash scripts/sync-panel-ports.sh",
      output: output.slice(0, 8000),
    };
  }
}

/** After Admin → Settings → Server save: persist .env and reload nginx. */
export async function syncPanelPortsAfterSettingsSave(): Promise<PortSyncResult> {
  const raw = await getSettingGroup("server");
  const settings = parsePanelServerSettings(raw);
  syncPanelServerEnv(settings);
  await persistExtendedPortsToEnv(settings);
  return runPortSyncScript();
}

/** Merge local stream-server ports into panel settings, persist .env, reload nginx. */
export async function applyLocalServerPortProfile(
  profile: ServerPortProfile
): Promise<PortSyncResult> {
  const current = await getPanelServerSettings();
  const merged: PanelServerSettings = {
    ...current,
    streamHttpPort: profile.streamHttpPort,
    streamHttpsPort: profile.streamHttpsPort,
    panelSslPort: profile.panelSslPort,
  };

  const skipReload = localPortProfileUnchanged(current, profile);
  await setSettingGroup("server", merged as unknown as Record<string, unknown>);
  syncPanelServerEnv(merged);
  await persistExtendedPortsToEnv(merged, profile);
  if (skipReload) {
    return {
      ok: true,
      message: "Server saved — nginx reload skipped because stream ports did not change.",
      output: "",
    };
  }
  return runPortSyncScript();
}
