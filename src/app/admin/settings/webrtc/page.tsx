import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function WebRtcSettingsPage() {
  return (
    <SettingsPanelForm
      group="webrtc"
      title="WebRTC low-latency"
      description="Full WebRTC stack via MediaMTX WHEP gateway — sub-second to ~3s live latency (vs 6–30s HLS)."
      sections={[
        {
          title: "Gateway",
          info: "Install MediaMTX on stream edges: bash scripts/install-mediamtx-webrtc.sh. WHEP playback uses path live_{streamId}.",
          fields: [
            { key: "enabled", label: "Enable WebRTC playback", type: "yesno" },
            {
              key: "gatewayMode",
              label: "Gateway mode",
              type: "select",
              options: [
                { value: "mediamtx", label: "MediaMTX (recommended)" },
                { value: "external-whep", label: "External WHEP URL" },
              ],
            },
            {
              key: "gatewayBaseUrl",
              label: "Gateway base URL",
              placeholder: "http://127.0.0.1:8889",
              hint: "MediaMTX WebRTC HTTP base. Leave empty to use each stream server host + WebRTC port.",
            },
            {
              key: "mediamtxApiUrl",
              label: "MediaMTX API URL",
              placeholder: "http://127.0.0.1:9997",
              hint: "Used to register on-demand paths per stream.",
            },
            { key: "webrtcPort", label: "WebRTC port (per server)", type: "number", placeholder: "8889" },
            {
              key: "webrtcPathPrefix",
              label: "Path prefix",
              placeholder: "live",
              hint: "Stream paths become live_{streamId} → /live_{id}/whep",
            },
          ],
        },
        {
          title: "ICE / NAT traversal",
          fields: [
            {
              key: "stunUrls",
              label: "STUN servers",
              placeholder: "stun:stun.l.google.com:19302",
              colSpan: 2,
              hint: "Comma-separated stun: URLs.",
            },
            { key: "turnUrl", label: "TURN URL", placeholder: "turn:turn.example.com:3478", colSpan: 2 },
            { key: "turnUsername", label: "TURN username", type: "text" },
            { key: "turnCredential", label: "TURN credential", type: "text" },
          ],
        },
        {
          title: "Playback",
          fields: [
            { key: "fallbackToHls", label: "Fallback to HLS if WebRTC fails", type: "yesno" },
            {
              key: "lowLatencyTargetMs",
              label: "Target latency (ms)",
              type: "number",
              placeholder: "500",
              hint: "Display / monitoring hint only.",
            },
            {
              key: "sessionTtlSec",
              label: "Session TTL (seconds)",
              type: "number",
              placeholder: "3600",
            },
          ],
        },
      ]}
    />
  );
}
