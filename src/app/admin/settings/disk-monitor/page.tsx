import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function DiskMonitorSettingsPage() {
  return (
    <SettingsPanelForm
      group="disk-monitor"
      title="Disk Monitor"
      description="Dedicated disk usage monitoring with configurable alerts and optional automatic cleanup."
      sections={[
        {
          title: "General",
          fields: [
            { key: "diskMonitorEnabled", label: "Enable disk monitor", type: "yesno", hint: "Master switch for disk monitoring." },
            { key: "diskMonitorIntervalMinutes", label: "Check interval (minutes)", type: "number", placeholder: "15", hint: "How often to check disk usage." },
            { key: "diskMonitorThresholdPercent", label: "Alert threshold (%)", type: "number", placeholder: "85", hint: "Disk usage percentage that triggers an alert." },
          ],
        },
        {
          title: "Prediction",
          fields: [
            { key: "diskMonitorPredictFullHours", label: "Predict full in (hours)", type: "number", placeholder: "24", hint: "Predict when disk will be full based on current growth rate." },
          ],
        },
        {
          title: "Auto-Cleanup",
          fields: [
            { key: "diskMonitorAutoCleanup", label: "Enable auto-cleanup", type: "yesno", hint: "Automatically clean old files when threshold is reached." },
            { key: "diskMonitorCleanupTargets", label: "Cleanup targets", type: "textarea", placeholder: "/var/log\n/tmp\n/var/cache", hint: "Directories to clean when auto-cleanup triggers (one per line)." },
          ],
        },
        {
          title: "Notifications",
          fields: [
            { key: "diskMonitorAlertChannels", label: "Alert channels", type: "textarea", placeholder: "telegram\nemail", hint: "Channels to send alerts to (one per line)." },
          ],
        },
      ]}
    />
  );
}
