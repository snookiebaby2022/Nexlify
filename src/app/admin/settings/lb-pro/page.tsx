import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function LbProSettingsPage() {
  return (
    <SettingsPanelForm
      group="lb-pro"
      title="Intelligent LB Pack"
      description="Health-check routing, geo-closest server, bandwidth-aware distribution, automatic failover."
      sections={[
        {
          title: "License",
          info: "Requires Intelligent LB Pack WHMCS addon (£25–40/mo) or Full Enterprise Bundle.",
          fields: [{ key: "enabled", label: "Enable Intelligent LB", type: "yesno" }],
        },
        {
          title: "Routing",
          fields: [
            { key: "geoRouting", label: "Geo-closest server routing", type: "yesno" },
            { key: "bandwidthAware", label: "Bandwidth-aware distribution", type: "yesno" },
            { key: "failoverOnDegraded", label: "Auto-failover on degraded/offline servers", type: "yesno" },
            { key: "healthCheckIntervalSec", label: "Health check interval (seconds)", type: "number" },
            {
              key: "cloudflareGuidance",
              label: "Show Cloudflare/Akamai integration notes",
              type: "yesno",
            },
          ],
        },
      ]}
    />
  );
}
