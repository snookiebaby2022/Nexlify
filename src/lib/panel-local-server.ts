import { parseServerPanelSettings } from "@/lib/server-panel-settings";
import { RTMP_PORT, STREAM_HTTPS_PORT } from "@/lib/server-ports";

export type ServerPortProfile = {
  streamHttpPort: number;
  streamHttpsPort: number;
  panelSslPort: number;
  rtmpPort: number;
  httpExtraPorts: number[];
  httpsExtraPorts: number[];
};

function parsePortList(raw: unknown, exclude: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const add = (n: number) => {
    if (!Number.isFinite(n) || n < 1 || n > 65535) return;
    const p = Math.floor(n);
    if (exclude.includes(p) || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  if (Array.isArray(raw)) {
    for (const item of raw) add(Number(item));
  }
  return out;
}

/** True when host is this panel machine (localhost, primary domain, or panel IP). */
export function isLocalPanelHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h || h === "127.0.0.1" || h === "localhost" || h === "::1") return true;
  const primary = (process.env.PANEL_PRIMARY_DOMAIN ?? "").trim().toLowerCase();
  if (primary && (h === primary || h.endsWith(`.${primary}`))) return true;
  const serverIp = (process.env.SERVER_IP ?? "").trim().toLowerCase();
  if (serverIp && h === serverIp) return true;
  const publicIp = (process.env.PUBLIC_IP ?? process.env.PANEL_PUBLIC_IP ?? "").trim().toLowerCase();
  if (publicIp && h === publicIp) return true;
  return false;
}

export function isLocalPanelServer(server: {
  host: string;
  domain?: string | null;
  panelSettings?: unknown;
}): boolean {
  const { advanced } = parseServerPanelSettings(server.panelSettings);
  if (advanced.serverRole === "main") return true;
  if (isLocalPanelHost(server.host)) return true;
  if (server.domain && isLocalPanelHost(server.domain)) return true;
  return false;
}

export function serverPortProfile(server: {
  port: number;
  httpsPort?: number | null;
  rtmpPort?: number | null;
  panelSettings?: unknown;
}): ServerPortProfile {
  const { advanced } = parseServerPanelSettings(server.panelSettings);
  const streamHttpPort = Math.floor(Number(server.port) || 8080);
  const streamHttpsPort = Math.floor(Number(server.httpsPort ?? STREAM_HTTPS_PORT));
  const rtmpPort = Math.floor(Number(server.rtmpPort ?? RTMP_PORT));
  return {
    streamHttpPort,
    streamHttpsPort,
    panelSslPort: streamHttpsPort,
    rtmpPort: Number.isFinite(rtmpPort) && rtmpPort > 0 ? rtmpPort : RTMP_PORT,
    httpExtraPorts: parsePortList(advanced.httpPorts, [streamHttpPort]),
    httpsExtraPorts: parsePortList(advanced.httpsPorts, [streamHttpsPort]),
  };
}
