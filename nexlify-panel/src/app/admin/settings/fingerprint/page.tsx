import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function FingerprintSettingsPage() {
  return (
    <SettingsPanelForm
      group="fingerprint"
      title="Fingerprint"
      description="Device fingerprinting for stream URLs and anti-restream checks."
      sections={[
        {
          title: "Fingerprint",
          info: "When enabled, playback URLs can include a signed fingerprint derived from client IP and user agent.",
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
      ]}
    />
  );
}
