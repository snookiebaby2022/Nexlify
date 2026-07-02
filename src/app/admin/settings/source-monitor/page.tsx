import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function SourceMonitorSettingsPage() {
  return (
    <SettingsPanelForm
      group="source-monitor"
      title="Down Source Realtime"
      description="Real-time source monitoring with instant offline alerts and automatic restart capabilities."
      sections={[
        {
          title: "General",
          fields: [
            { key: "sourceMonitorEnabled", label: "Enable source monitoring", type: "yesno", hint: "Master switch for real-time source monitoring." },
            { key: "sourceMonitorIntervalSeconds", label: "Check interval (seconds)", type: "number", placeholder: "30", hint: "How often to probe stream sources." },
          ],
        },
        {
          title: "Alerts",
          fields: [
            { key: "sourceMonitorOfflineAlert", label: "Alert on offline", type: "yesno", hint: "Send alert when a source goes offline." },
            { key: "sourceMonitorLatencyAlert", label: "Alert on high latency", type: "yesno", hint: "Send alert when source latency exceeds threshold." },
            { key: "sourceMonitorLatencyThresholdMs", label: "Latency threshold (ms)", type: "number", placeholder: "5000", hint: "Maximum acceptable latency before alerting." },
          ],
        },
        {
          title: "Auto-Recovery",
          fields: [
            { key: "sourceMonitorAutoRestart", label: "Auto-restart failed sources", type: "yesno", hint: "Automatically restart stream sources that go offline." },
            { key: "sourceMonitorMaxRestartsPerHour", label: "Max restarts per hour", type: "number", placeholder: "5", hint: "Limit auto-restarts to prevent restart loops." },
          ],
        },
        {
          title: "Notifications",
          fields: [
            { key: "sourceMonitorNotifyChannels", label: "Notify channels", type: "textarea", placeholder: "telegram\nemail", hint: "Channels to send alerts to (one per line)." },
          ],
        },
      ]}
    />
  );
}
