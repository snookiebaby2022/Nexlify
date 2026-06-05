import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function PlayerSettingsPage() {
  return (
    <SettingsPanelForm
      group="player"
      title="Player & CDM"
      description="Built-in player and content decryption (CDM) for protected streams."
      sections={[
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
