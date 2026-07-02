import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function SecurityShieldSettingsPage() {
  return (
    <SettingsPanelForm
      group="security-shield"
      title="Security Shield Pack"
      description="VPN/proxy/datacenter detection via MaxMind + IPQualityScore, auto-block, connection logging."
      sections={[
        {
          title: "License",
          fields: [{ key: "enabled", label: "Enable Security Shield", type: "yesno" }],
        },
        {
          title: "IP reputation",
          fields: [
            { key: "ipqsApiKey", label: "IPQualityScore API key", type: "text", colSpan: 2 },
            { key: "blockVpn", label: "Block VPN/proxy", type: "yesno" },
            { key: "blockDatacenter", label: "Block datacenter/hosting IPs", type: "yesno" },
            { key: "blockTor", label: "Block Tor exit nodes", type: "yesno" },
            { key: "fraudScoreBlockThreshold", label: "Auto-block fraud score ≥", type: "number" },
            { key: "fraudScoreFlagThreshold", label: "Flag fraud score ≥", type: "number" },
            { key: "logConnectionSource", label: "Log connection source details", type: "yesno" },
            { key: "autoBlockFlagged", label: "Auto-add flagged IPs to blocklist", type: "yesno" },
          ],
        },
      ]}
    />
  );
}
