import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function StreamAnalyzerSettingsPage() {
  return (
    <SettingsPanelForm
      group="stream-analyzer"
      title="Smart Stream Analyzer"
      description="Auto-detect and fix audio sync issues, video bitrate problems, frame drops, and resolution mismatches."
      sections={[
        {
          title: "General",
          fields: [
            { key: "analyzerEnabled", label: "Enable Smart Analyzer", type: "yesno", hint: "Master switch for automatic stream analysis." },
            { key: "analyzerIntervalSeconds", label: "Analysis interval (seconds)", type: "number", placeholder: "60", hint: "How often to analyze stream health." },
            { key: "analyzerAutoRepair", label: "Auto-repair on detection", type: "yesno", hint: "Automatically attempt fixes when issues are detected." },
          ],
        },
        {
          title: "Detection",
          fields: [
            { key: "analyzerAudioSync", label: "Detect audio sync issues", type: "yesno", hint: "Detect audio/video synchronization problems." },
            { key: "analyzerVideoBitrate", label: "Detect bitrate anomalies", type: "yesno", hint: "Detect sudden bitrate drops or spikes." },
            { key: "analyzerFrameDrop", label: "Detect frame drops", type: "yesno", hint: "Detect missing frames and stuttering." },
            { key: "analyzerResolutionMismatch", label: "Detect resolution mismatch", type: "yesno", hint: "Detect when output resolution differs from source." },
          ],
        },
        {
          title: "Alerting",
          fields: [
            { key: "analyzerAlertThreshold", label: "Alert threshold (consecutive failures)", type: "number", placeholder: "5", hint: "How many failed checks before alerting." },
          ],
        },
      ]}
    />
  );
}
