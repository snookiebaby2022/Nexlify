import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function CatchupSettingsPage() {
  return (
    <SettingsPanelForm
      group="catchup"
      title="Catch-up TV"
      description="Configure time-shifted TV recordings and replay settings."
      sections={[
        {
          title: "General",
          fields: [
            { key: "catchupEnabled", label: "Enable catch-up TV", type: "yesno", hint: "Allow viewers to replay past broadcasts." },
            { key: "catchupDays", label: "Catch-up duration (days)", type: "number", placeholder: "7", hint: "How many days to keep recordings." },
            { key: "catchupStoragePath", label: "Storage path", placeholder: "/var/catchup", hint: "Directory for storing recordings." },
            { key: "catchupMaxFileSize", label: "Max file size (MB)", type: "number", placeholder: "2048", hint: "Maximum size per recording file." },
          ],
        },
        {
          title: "Quality",
          fields: [
            { key: "catchupQuality", label: "Default quality", type: "select", options: [{ value: "SD", label: "SD" }, { value: "HD", label: "HD" }, { value: "FHD", label: "FHD" }, { value: "4K", label: "4K" }], hint: "Recording quality preset." },
            { key: "catchupBitrate", label: "Bitrate (kbps)", type: "number", placeholder: "4000", hint: "Video bitrate for recordings." },
          ],
        },
        {
          title: "Channels",
          info: "Select which channels support catch-up. This is managed per-channel in the stream settings.",
          fields: [
            { key: "catchupAllChannels", label: "Enable for all channels", type: "yesno", hint: "Override: enable catch-up on all live channels." },
          ],
        },
      ]}
    />
  );
}
