import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function CommunitySettingsPage() {
  return (
    <SettingsPanelForm
      group="community"
      title="Community & chat links"
      description="Telegram, Discord, and Signal links shown on the login page, settings sidebar, and panel footer."
      sections={[
        {
          title: "Links",
          info: "Use full https:// URLs. Leave blank to hide a link.",
          fields: [
            { key: "telegramUrl", label: "Telegram group / channel", placeholder: "https://t.me/yourgroup" },
            { key: "discordUrl", label: "Discord server invite", placeholder: "https://discord.gg/invite" },
            { key: "signalUrl", label: "Signal group link", placeholder: "https://signal.group/#..." },
          ],
        },
      ]}
    />
  );
}
