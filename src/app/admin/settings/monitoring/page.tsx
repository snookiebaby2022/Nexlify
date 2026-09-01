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
            {
              key: "alertOfflineStreams",
              label: "Offline streaming servers",
              type: "yesno",
              hint: "Telegram when a load balancer or agent stops checking in, or its health is offline.",
            },
            {
              key: "offlineStreamMinutes",
              label: "Offline after (minutes)",
              type: "number",
              hint: "How long the agent can be silent before that server is treated as down. 1 = alert after one minute.",
            },
            {
              key: "alertHighLoad",
              label: "High connection load",
              type: "yesno",
              hint: "Telegram when too many people are watching at once (Live Connections), not when a server is down.",
            },
            {
              key: "highLoadConnectionsThreshold",
              label: "Connection threshold",
              type: "number",
              hint: "Fire that alert when active viewers (seen in the last 2 minutes) reach this number. Example: 500.",
            },
            {
              key: "alertAbuse",
              label: "Multiple failed stream probes",
              type: "yesno",
              hint: "Off by default. Needs catalog probes, which burn Main CPU. Use Diagnostics or click a failing channel instead.",
            },
          ],
        },
        {
          title: "Metrics export",
          info: "Prometheus text exposition for Grafana / Datadog / etc. Scrape GET /api/metrics with Bearer token.",
          fields: [
            { key: "metricsExportEnabled", label: "Enable metrics endpoint", type: "yesno" },
            {
              key: "metricsExportToken",
              label: "Metrics bearer token",
              type: "password",
              hint: "Required when enabled. Scrape with Authorization: Bearer <token> (query-string tokens are not accepted).",
            },
          ],
        },
      ]}
    />
  );
}
