import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function TranscodingPackSettingsPage() {
  return (
    <SettingsPanelForm
      group="transcoding-pack"
      title="Transcoding Pro Pack"
      description="GPU-accelerated adaptive transcoding — NVENC, VAAPI, QuickSync with bitrate ladders and 4K/HEVC."
      sections={[
        {
          title: "License",
          info: "Requires Transcoding Pro Pack WHMCS addon (£35–55/mo) or Full Enterprise Bundle.",
          fields: [{ key: "enabled", label: "Enable Transcoding Pro", type: "yesno" }],
        },
        {
          title: "GPU encoders",
          fields: [
            {
              key: "defaultGpuEncoder",
              label: "Preferred GPU",
              type: "select",
              options: [
                { value: "auto", label: "Auto-detect" },
                { value: "nvenc", label: "NVIDIA NVENC" },
                { value: "qsv", label: "Intel QuickSync" },
                { value: "vaapi", label: "VAAPI (AMD/Intel)" },
                { value: "cpu", label: "CPU only" },
              ],
            },
            { key: "enableHevc", label: "Enable HEVC/H.265 profiles", type: "yesno" },
            { key: "enable4K", label: "Enable 4K output profiles", type: "yesno" },
            { key: "autoFallback", label: "Auto-fallback to CPU if GPU unavailable", type: "yesno" },
            { key: "realtimeQualityAdjust", label: "Real-time quality adjustment hints", type: "yesno" },
            { key: "vaapiDevice", label: "VAAPI device path", placeholder: "/dev/dri/renderD128" },
            {
              key: "ladderProfile",
              label: "Default ladder top profile",
              type: "select",
              options: [
                { value: "4k-hevc-nvenc", label: "4K HEVC NVENC" },
                { value: "1080p-nvenc", label: "1080p NVENC" },
                { value: "720p-qsv", label: "720p QuickSync" },
              ],
            },
          ],
        },
      ]}
    />
  );
}
