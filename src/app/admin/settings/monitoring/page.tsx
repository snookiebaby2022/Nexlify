import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function MonitoringSettingsPage() {
  return (
    <SettingsPanelForm
      group="monitoring"
      title="Monitoring & Telegram"
      description="Telegram bot alerts for offline streams, high load, and abuse detection."
      sections={[
        {
          title: "Telegram bot",
          info: "Create a bot via @BotFather, add it to your ops chat, and paste token + chat id.",
          fields: [
            { key: "telegramAlertsEnabled", label: "Enable Telegram alerts", type: "yesno" },
            { key: "telegramBotToken", label: "Bot token", type: "password" },
            { key: "telegramChatId", label: "Chat ID", placeholder: "-1001234567890" },
          ],
        },
        {
          title: "Alert types",
          fields: [
            { key: "alertOfflineStreams", label: "Offline streaming servers", type: "yesno" },
            { key: "offlineStreamMinutes", label: "Offline after (minutes)", type: "number" },
            { key: "alertHighLoad", label: "High connection load", type: "yesno" },
            { key: "highLoadConnectionsThreshold", label: "Connection threshold", type: "number" },
            { key: "alertAbuse", label: "Multiple failed stream probes", type: "yesno" },
          ],
        },
      ]}
    />
  );
}
