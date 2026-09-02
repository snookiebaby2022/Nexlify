import { SettingsPanelForm } from "@/components/settings-panel-form";
import { OFFLINE_STREAM_IMAGE_TEMPLATES } from "@/lib/offline-stream-image";

export default function PlayerSettingsPage() {
  return (
    <SettingsPanelForm
      group="player"
      title="Player & CDM"
      description="Built-in player, offline splash screens for IPTV apps, and content decryption (CDM)."
      sections={[
        {
          title: "Offline channel splash (IPTV apps)",
          info:
            "When a channel fails to play, many IPTV apps show this image (sent as offline_image_url in player_api). Pick a built-in template or paste your own image URL — custom URL overrides the template.",
          fields: [
            {
              key: "offlineStreamImageTemplate",
              label: "Template",
              type: "select",
              options: OFFLINE_STREAM_IMAGE_TEMPLATES.map((t) => ({ value: t.id, label: t.label })),
            },
            {
              key: "offlineStreamImageUrl",
              label: "Custom image URL (optional)",
              placeholder: "https://your-cdn.com/offline.png",
              colSpan: 2,
            },
          ],
        },
        {
          title: "WebRTC preview",
          info: "Enable WebRTC in Settings → WebRTC and install MediaMTX on stream servers for sub-second live preview.",
          fields: [
            { key: "webrtcPreviewEnabled", label: "Show WebRTC in probe player", type: "yesno" },
          ],
        },
        {
          title: "Built-in CDM",
          info: "When enabled, the panel player uses the bundled Widevine module for DRM-protected HLS/DASH where your license server allows it.",
          fields: [
            { key: "builtInCdm", label: "Enable built-in CDM", type: "yesno" },
            { key: "widevineEnabled", label: "Widevine", type: "yesno" },
            { key: "playreadyEnabled", label: "PlayReady", type: "yesno" },
            {
              key: "licenseProxyUrl",
              label: "License proxy URL",
              placeholder: "https://panel.example.com/api/player/license",
              colSpan: 2,
            },
            { key: "cdmNotes", label: "Notes", type: "textarea", colSpan: 3 },
          ],
        },
      ]}
    />
  );
}
