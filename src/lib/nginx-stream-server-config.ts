import { getSettingGroup } from "@/lib/panel-settings";
import { buildNginxAgentSnippet } from "@/lib/nginx-agent-snippet";
import type { AgentNginxConfig } from "@/lib/stream-agent-config";

export async function buildStreamServerNginxConfig(panelUrl?: string): Promise<string> {
  const streams = await getSettingGroup("streams");
  const server = await getSettingGroup("server");
  const serverUrl =
    typeof server.serverUrl === "string" && server.serverUrl.trim()
      ? server.serverUrl.trim()
      : undefined;
  const panelOrigin = (panelUrl || serverUrl || "https://panel.example.com").replace(/\/$/, "");

  const nginx: AgentNginxConfig = {
    bufferLive: streams.antiFreezeEnabled !== false ? false : Boolean(streams.nginxBufferLive),
    bufferVod: Boolean(streams.nginxBufferVod),
    bufferCountLive: Number(streams.nginxBufferCountLive ?? 96),
    bufferCountVod: Number(streams.nginxBufferCountVod ?? 96),
    bufferSizeLive: String(streams.nginxBufferSizeLive ?? "32k"),
    bufferSizeVod: String(streams.nginxBufferSizeVod ?? "32k"),
    hlsSegmentDuration: streams.antiFreezeEnabled !== false ? 4 : Number(streams.hlsSegmentDuration ?? 6),
    proxyBufferSize: String(streams.bufferSize ?? "512k"),
    readTimeout: Number(streams.readTimeout ?? 30),
    connectionTimeout: Number(streams.connectionTimeout ?? 10),
  };

  const snippet = buildNginxAgentSnippet(nginx);
  const preferredOutput = String(streams.preferredLiveOutput ?? "hls");

  return `# Nexlify stream server — generated ${new Date().toISOString()}
# Panel: ${panelOrigin}
# Preferred live output: ${preferredOutput} (use .m3u8 for web players; .ts for MAG/Stalker)
# Anti-Freeze: ${streams.antiFreezeEnabled !== false ? "ON" : "OFF"} | Fast Zap: ${streams.fastZapEnabled !== false ? "ON" : "OFF"}
# Neighbour prefetch: ×${streams.zapPrefetchNeighbors ?? 3} on ${streams.zapPrefetchOnLiveHit !== false ? "channel play" : "disabled"}

${snippet}

# --- Recommended server block (include in http {}) ---
#
# upstream nexlify_panel {
#     server PANEL_HOST:443;
#     keepalive 32;
# }
#
# location ~ ^/live/ {
#     proxy_pass PANEL_ORIGIN;
#     proxy_buffering off;
#     proxy_read_timeout 300s;
#     add_header Access-Control-Allow-Origin *;
# }
#
# location /hls/ {
#     alias /var/www/nexlify-hls/;
#     types { application/vnd.apple.mpegurl m3u8; video/mp2t ts; }
#     add_header Cache-Control no-cache;
# }
#
# Full template: nginx/nexlify-stream-server.conf in the Nexlify panel repo.
`;
}
