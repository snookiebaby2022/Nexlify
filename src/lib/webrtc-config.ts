import { getSettingGroup } from "@/lib/panel-settings";

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type WebRtcSettings = {
  enabled: boolean;
  gatewayMode: "mediamtx" | "external-whep";
  gatewayBaseUrl: string;
  mediamtxApiUrl: string;
  webrtcPathPrefix: string;
  stunUrls: string;
  turnUrl: string;
  turnUsername: string;
  turnCredential: string;
  fallbackToHls: boolean;
  lowLatencyTargetMs: number;
  sessionTtlSec: number;
  webrtcPort: number;
};

export async function getWebRtcSettings(): Promise<WebRtcSettings> {
  const raw = await getSettingGroup("webrtc" as never);
  return {
    enabled: raw.enabled === true,
    gatewayMode: raw.gatewayMode === "external-whep" ? "external-whep" : "mediamtx",
    gatewayBaseUrl: String(raw.gatewayBaseUrl ?? "").replace(/\/+$/, ""),
    mediamtxApiUrl: String(raw.mediamtxApiUrl ?? "http://127.0.0.1:9997").replace(/\/+$/, ""),
    webrtcPathPrefix: String(raw.webrtcPathPrefix ?? "live").replace(/^\/+|\/+$/g, ""),
    stunUrls: String(
      raw.stunUrls ?? "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"
    ),
    turnUrl: String(raw.turnUrl ?? ""),
    turnUsername: String(raw.turnUsername ?? ""),
    turnCredential: String(raw.turnCredential ?? ""),
    fallbackToHls: raw.fallbackToHls !== false,
    lowLatencyTargetMs: Number(raw.lowLatencyTargetMs ?? 500),
    sessionTtlSec: Number(raw.sessionTtlSec ?? 3600),
    webrtcPort: Number(raw.webrtcPort ?? 8889),
  };
}

export function parseStunUrls(stunUrls: string): string[] {
  return stunUrls
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildIceServers(settings: WebRtcSettings): IceServerConfig[] {
  const servers: IceServerConfig[] = parseStunUrls(settings.stunUrls).map((url) => ({ urls: url }));
  if (settings.turnUrl.trim()) {
    servers.push({
      urls: settings.turnUrl.trim(),
      username: settings.turnUsername || undefined,
      credential: settings.turnCredential || undefined,
    });
  }
  return servers;
}

export function webrtcPathForStream(streamId: string, prefix: string): string {
  const clean = streamId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `${prefix}_${clean}`;
}

export function buildWhepUrl(
  settings: WebRtcSettings,
  streamId: string,
  serverHost?: string | null
): string {
  const path = webrtcPathForStream(streamId, settings.webrtcPathPrefix);
  if (settings.gatewayMode === "external-whep" && settings.gatewayBaseUrl) {
    return `${settings.gatewayBaseUrl}/${path}/whep`;
  }
  const host = serverHost?.trim() || "127.0.0.1";
  const base = settings.gatewayBaseUrl || `http://${host}:${settings.webrtcPort}`;
  return `${base.replace(/\/+$/, "")}/${path}/whep`;
}
