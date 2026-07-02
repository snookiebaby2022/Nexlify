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
