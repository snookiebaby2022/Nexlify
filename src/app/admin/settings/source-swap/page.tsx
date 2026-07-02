import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function SourceSwapSettingsPage() {
  return (
    <SettingsPanelForm
      group="source-swap"
      title="Swap Stream Source"
      description="Instant source switching with zero downtime for viewers when a stream fails or becomes overloaded."
      sections={[
        {
          title: "General",
          fields: [
            { key: "sourceSwapEnabled", label: "Enable source swap", type: "yesno", hint: "Master switch for instant source switching." },
            { key: "sourceSwapGracePeriodMs", label: "Grace period (ms)", type: "number", placeholder: "5000", hint: "Time to wait before switching sources." },
            { key: "sourceSwapFailoverRetries", label: "Failover retries", type: "number", placeholder: "2", hint: "Retry current source before switching." },
          ],
        },
        {
          title: "Triggers",
          fields: [
            { key: "sourceSwapOnFailure", label: "Swap on failure", type: "yesno", hint: "Switch to backup source when primary fails." },
            { key: "sourceSwapOnHighLoad", label: "Swap on high load", type: "yesno", hint: "Switch to backup source when primary is overloaded." },
          ],
        },
        {
          title: "Viewer Experience",
          fields: [
            { key: "sourceSwapPreserveViewerPosition", label: "Preserve viewer position", type: "yesno", hint: "Try to resume from the same timestamp after switching." },
            { key: "sourceSwapNotifyOnChange", label: "Notify on source change", type: "yesno", hint: "Alert admins when a source swap occurs." },
          ],
        },
      ]}
    />
  );
}
