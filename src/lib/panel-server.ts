import fs from "fs";
import path from "path";
import { getSettingGroup, setSettingGroup } from "@/lib/panel-settings";
import {
  resolvePanelListenPort,
  resolveStreamEdgeHttpPort,
  resolveStreamHttpsPort,
  STREAM_HTTPS_PORT,
} from "@/lib/server-ports";

export type PanelUpdateLogEntry = {
  at: string;
  ok: boolean;
  message: string;
  fromVersion: string;
  toVersion: string;
  action: "update" | "rollback";
  steps?: { name: string; ok: boolean; output: string }[];
};

export type PanelServerSettings = {
  panelPort: number;
  panelSslPort: number;
  streamHttpPort: number;
  streamHttpsPort: number;
  repoPath: string;
  lastPanelUpdate: {
    at: string;
    ok: boolean;
    message: string;
    fromVersion: string;
    toVersion: string;
  } | null;
  updateHistory: PanelUpdateLogEntry[];
  rollbackGitRef: string | null;
  updateCheckUrl: string;
};

const MAX_UPDATE_HISTORY = 20;

export function parsePanelServerSettings(raw: Record<string, unknown>): PanelServerSettings {
  let panelPort = Number(raw.panelPort ?? resolvePanelListenPort());
  if (!Number.isFinite(panelPort) || panelPort < 1 || panelPort > 65535) {
    panelPort = resolvePanelListenPort();
  }

  let panelSslPort = Number(raw.panelSslPort ?? STREAM_HTTPS_PORT);
  if (!Number.isFinite(panelSslPort) || panelSslPort < 1 || panelSslPort > 65535) {
    panelSslPort = STREAM_HTTPS_PORT;
  }

  let streamHttpPort = Number(raw.streamHttpPort ?? resolveStreamEdgeHttpPort());
  if (!Number.isFinite(streamHttpPort) || streamHttpPort < 1 || streamHttpPort > 65535) {
    streamHttpPort = resolveStreamEdgeHttpPort();
  }

  let streamHttpsPort = Number(raw.streamHttpsPort ?? resolveStreamHttpsPort());
  if (!Number.isFinite(streamHttpsPort) || streamHttpsPort < 1 || streamHttpsPort > 65535) {
    streamHttpsPort = resolveStreamHttpsPort();
  }

  const last = raw.lastPanelUpdate;
  let lastPanelUpdate: PanelServerSettings["lastPanelUpdate"] = null;
  if (last && typeof last === "object") {
    const l = last as Record<string, unknown>;
    lastPanelUpdate = {
      at: String(l.at ?? ""),
      ok: Boolean(l.ok),
      message: String(l.message ?? ""),
      fromVersion: String(l.fromVersion ?? ""),
      toVersion: String(l.toVersion ?? ""),
    };
  }

  let updateHistory: PanelUpdateLogEntry[] = [];
  if (Array.isArray(raw.updateHistory)) {
    updateHistory = raw.updateHistory
      .filter((e) => e && typeof e === "object")
      .map((e) => {
        const row = e as Record<string, unknown>;
        return {
          at: String(row.at ?? ""),
          ok: Boolean(row.ok),
          message: String(row.message ?? ""),
          fromVersion: String(row.fromVersion ?? ""),
          toVersion: String(row.toVersion ?? ""),
          action: (row.action === "rollback" ? "rollback" : "update") as "update" | "rollback",
          steps: Array.isArray(row.steps)
            ? row.steps.map((s) => {
                const st = s as Record<string, unknown>;
                return {
                  name: String(st.name ?? ""),
                  ok: Boolean(st.ok),
                  output: String(st.output ?? ""),
                };
              })
            : undefined,
        };
      })
      .slice(0, MAX_UPDATE_HISTORY);
  }

  return {
    panelPort: Math.floor(panelPort),
    panelSslPort: Math.floor(panelSslPort),
    streamHttpPort: Math.floor(streamHttpPort),
    streamHttpsPort: Math.floor(streamHttpsPort),
    repoPath: String(raw.repoPath ?? "").trim(),
    lastPanelUpdate,
    updateHistory,
    rollbackGitRef: raw.rollbackGitRef != null ? String(raw.rollbackGitRef) : null,
    updateCheckUrl: String(raw.updateCheckUrl ?? process.env.PANEL_UPDATE_URL ?? "").trim(),
  };
}

export async function getPanelServerSettings(): Promise<PanelServerSettings> {
  return parsePanelServerSettings(await getSettingGroup("server"));
}

export async function savePanelServerSettings(
  patch: Partial<PanelServerSettings>
): Promise<PanelServerSettings> {
  const current = await getPanelServerSettings();
  const merged: PanelServerSettings = { ...current, ...patch };
  if (patch.panelPort != null) {
    const p = Number(patch.panelPort);
    if (!Number.isFinite(p) || p < 1 || p > 65535) throw new Error("Invalid port (1–65535)");
    merged.panelPort = Math.floor(p);
  }
  await setSettingGroup("server", merged as unknown as Record<string, unknown>);
  syncPanelServerEnv(merged);
  return merged;
}

export function appendUpdateHistory(
  settings: PanelServerSettings,
  entry: Omit<PanelUpdateLogEntry, "at"> & { at?: string }
): PanelServerSettings {
  const row: PanelUpdateLogEntry = {
    at: entry.at ?? new Date().toISOString(),
    ok: entry.ok,
    message: entry.message,
    fromVersion: entry.fromVersion,
    toVersion: entry.toVersion,
    action: entry.action,
    steps: entry.steps,
  };
  return {
    ...settings,
    lastPanelUpdate: {
      at: row.at,
      ok: row.ok,
      message: row.message,
      fromVersion: row.fromVersion,
      toVersion: row.toVersion,
    },
    updateHistory: [row, ...settings.updateHistory].slice(0, MAX_UPDATE_HISTORY),
  };
}

export function syncPanelServerEnv(settings: PanelServerSettings) {
  /** Public / MAG URL port from settings (listen port stays PORT in .env / PM2). */
  process.env.PANEL_PORT = String(settings.panelPort);
  process.env.PANEL_SSL_PORT = String(settings.panelSslPort);
  process.env.STREAM_EDGE_PORT = String(settings.streamHttpPort);
  process.env.STREAM_HTTP_PORT = String(settings.streamHttpPort);
  process.env.STREAM_HTTPS_PORT = String(settings.streamHttpsPort);
  if (settings.repoPath) {
    process.env.PANEL_REPO_PATH = settings.repoPath;
  } else {
    delete process.env.PANEL_REPO_PATH;
  }
}

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

/** Persist stream / SSL ports to .env so nginx + firewall scripts stay in sync after settings save. */
export async function persistServerPortsToEnv(settings: PanelServerSettings): Promise<void> {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  let raw = fs.readFileSync(envPath, "utf8");
  if (raw.includes("\r\n")) raw = raw.replace(/\r\n/g, "\n");

  let lines = raw.split("\n");
  lines = upsertEnvLine(lines, "STREAM_HTTP_PORT", String(settings.streamHttpPort));
  lines = upsertEnvLine(lines, "STREAM_EDGE_PORT", String(settings.streamHttpPort));
  lines = upsertEnvLine(lines, "STREAM_HTTPS_PORT", String(settings.streamHttpsPort));
  lines = upsertEnvLine(lines, "PANEL_SSL_PORT", String(settings.panelSslPort));

  fs.writeFileSync(envPath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

export async function warmPanelServerEnv() {
  try {
    const settings = await getPanelServerSettings();
    syncPanelServerEnv(settings);
  } catch {
    if (!process.env.PANEL_PORT) {
      process.env.PANEL_PORT = String(resolvePanelListenPort());
    }
  }
}

/** Append :port when not default for scheme (80/443). */
export function formatHostWithPort(
  host: string,
  port: number,
  scheme: "http" | "https"
): string {
  const defaultPort = scheme === "https" ? 443 : 80;
  if (port === defaultPort) return host;
  return `${host}:${port}`;
}

export function buildPanelOrigin(
  host: string,
  opts: { ssl?: boolean; forceHttps?: boolean; port?: number }
): string {
  const scheme: "http" | "https" = opts.ssl || opts.forceHttps ? "https" : "http";
  const port = opts.port ?? (scheme === "https" ? 443 : 80);
  const hostPart = formatHostWithPort(host, port, scheme);
  return `${scheme}://${hostPart}`;
}

export function getResolvedRepoPath(settings: PanelServerSettings): string {
  return settings.repoPath || process.env.PANEL_REPO_PATH || process.cwd();
}
