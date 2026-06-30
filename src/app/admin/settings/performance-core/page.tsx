import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function PerformanceCoreSettingsPage() {
  return (
    <SettingsPanelForm
      group="performance-core"
      title="Optimized Performance Core"
      description="Low RAM/CPU usage configuration optimized for large-scale events and high concurrent connections."
      sections={[
        {
          title: "General",
          fields: [
            { key: "perfCoreEnabled", label: "Enable Performance Core", type: "yesno", hint: "Master switch for performance optimizations." },
            { key: "perfLowRamMode", label: "Low RAM mode", type: "yesno", hint: "Reduce memory footprint for constrained environments." },
          ],
        },
        {
          title: "Streaming Optimizations",
          fields: [
            { key: "perfConnectionPooling", label: "Connection pooling", type: "yesno", hint: "Reuse connections to reduce overhead." },
            { key: "perfStreamPreload", label: "Stream preloading", type: "yesno", hint: "Preload segments for faster zapping." },
            { key: "perfBufferOptimization", label: "Buffer optimization", type: "yesno", hint: "Auto-tune HLS/DASH buffer sizes." },
            { key: "perfConnectionReuse", label: "Connection reuse", type: "yesno", hint: "Keep-alive connections between segments." },
          ],
        },
        {
          title: "Scaling",
          fields: [
            { key: "perfNginxWorkers", label: "Nginx workers", type: "text", placeholder: "auto", hint: "Nginx worker processes (auto = CPU cores)." },
            { key: "perfEventScaleMode", label: "Event scale mode", type: "select", options: [{ value: "dynamic", label: "Dynamic" }, { value: "fixed", label: "Fixed" }, { value: "aggressive", label: "Aggressive" }], hint: "How to handle sudden traffic spikes." },
            { key: "perfMaxEventConnections", label: "Max event connections", type: "number", placeholder: "50000", hint: "Maximum concurrent connections for large events." },
          ],
        },
      ]}
    />
  );
}
