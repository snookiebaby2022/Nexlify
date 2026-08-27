import { SettingsPanelForm } from "@/components/settings-panel-form";
import { LeakAuditPanel } from "@/components/leak-audit-panel";

export default function FingerprintSettingsPage() {
  return (
    <div className="space-y-8 pb-8">
      <SettingsPanelForm
        group="fingerprint"
        title="Fingerprint"
        description="Device fingerprinting for stream URLs, playback token TTL, and leak audit logging."
        sections={[
          {
            title: "Fingerprint",
            info: "When enabled, playback URLs include a signed fingerprint derived from client IP and user agent.",
            fields: [
              { key: "enabled", label: "Enable fingerprint", type: "yesno" },
              {
                key: "algorithm",
                label: "Algorithm",
                type: "select",
                options: [
                  { value: "sha256", label: "SHA-256" },
                  { value: "sha1", label: "SHA-1" },
                ],
              },
              { key: "includeUserAgent", label: "Include user agent", type: "yesno" },
              { key: "includeClientIp", label: "Include client IP", type: "yesno" },
              { key: "secret", label: "Signing secret", type: "password", colSpan: 2 },
            ],
          },
          {
            title: "On-video overlay (1-Stream fingerprint)",
            info: "Burns text onto restreamed channels that run through FFmpeg on the stream agent (transcode / capture / always-on). Direct proxy channels are not modified. Placeholders: {panel} {stream}.",
            fields: [
              { key: "overlayEnabled", label: "Burn overlay on FFmpeg restreams", type: "yesno" },
              {
                key: "overlayText",
                label: "Overlay text",
                placeholder: "{panel} {stream}",
                colSpan: 2,
              },
              {
                key: "overlayPosition",
                label: "Position",
                type: "select",
                options: [
                  { value: "tl", label: "Top left" },
                  { value: "tr", label: "Top right" },
                  { value: "bl", label: "Bottom left" },
                  { value: "br", label: "Bottom right" },
                ],
              },
              { key: "overlayFontSize", label: "Font size", type: "number" },
            ],
          },
          {
            title: "Leak audit log",
            fields: [
              { key: "leakAuditEnabled", label: "Log playback signatures", type: "yesno" },
              {
                key: "leakAuditRetentionDays",
                label: "Retention (days)",
                type: "number",
                hint: "Older entries can be purged from the leak audit page.",
              },
            ],
          },
        ]}
      />
      <LeakAuditPanel />
    </div>
  );
}
