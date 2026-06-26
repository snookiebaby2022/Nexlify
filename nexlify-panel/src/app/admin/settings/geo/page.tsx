import { SettingsForm } from "@/components/settings-form";

export default function GeoSettingsPage() {
  return (
    <SettingsForm
      group="geo"
      title="Geo & country lock"
      description="MaxMind database path and VPN/hosting blocks for playback."
      backHref="/admin/settings"
      fields={[
        { key: "enabled", label: "Enable geo checks", type: "checkbox" },
        {
          key: "maxmindDbPath",
          label: "MaxMind GeoLite2-Country.mmdb path",
          type: "text",
          hint: "e.g. /var/lib/GeoLite2-Country.mmdb — leave empty to use ip-api.co fallback",
        },
        { key: "blockVpnHosting", label: "Block VPN / hosting IPs", type: "checkbox" },
        { key: "fallbackIpApi", label: "Allow ip-api.co fallback", type: "checkbox" },
      ]}
    />
  );
}
