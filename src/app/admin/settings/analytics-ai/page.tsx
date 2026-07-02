import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function AnalyticsAiSettingsPage() {
  return (
    <SettingsPanelForm
      group="analytics-ai"
      title="Analytics + AI Pack"
      description="Churn prediction, peak heatmaps, regional content ranking, stream optimization, EPG AI matching."
      sections={[
        {
          title: "License",
          fields: [{ key: "enabled", label: "Enable Analytics + AI Pack", type: "yesno" }],
        },
        {
          title: "Features",
          fields: [
            { key: "churnPrediction", label: "Churn risk scoring", type: "yesno" },
            { key: "peakHeatmaps", label: "Peak concurrency heatmaps", type: "yesno" },
            { key: "regionalContentRank", label: "Top content by region", type: "yesno" },
            { key: "streamOptimizationHints", label: "Stream repair suggestions", type: "yesno" },
            { key: "epgAiMatching", label: "AI EPG match/fix suggestions", type: "yesno" },
            { key: "realtimeMonitor", label: "Real-time monitor stream (SSE)", type: "yesno" },
          ],
        },
      ]}
    />
  );
}
