import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function ArchivePackSettingsPage() {
  return (
    <SettingsPanelForm
      group="archive-pack"
      title="Archive & Timeshift Pack"
      description="Server-side recording with configurable retention, EPG-linked time machine, HLS/DASH catch-up."
      sections={[
        {
          title: "License",
          fields: [{ key: "enabled", label: "Enable Archive & Timeshift Pack", type: "yesno" }],
        },
        {
          title: "Recording",
          fields: [
            { key: "defaultRetentionDays", label: "Default retention (days)", type: "number" },
            { key: "maxRetentionDays", label: "Maximum retention (days)", type: "number" },
            { key: "storagePath", label: "Storage path", placeholder: "/var/nexlify/archive" },
            {
              key: "outputFormat",
              label: "Output format",
              type: "select",
              options: [
                { value: "hls", label: "HLS" },
                { value: "dash", label: "DASH" },
              ],
            },
            { key: "epgLinkedRecording", label: "EPG-linked automatic recording", type: "yesno" },
            { key: "recordAllChannels", label: "Record all live channels (override)", type: "yesno" },
          ],
        },
      ]}
    />
  );
}
