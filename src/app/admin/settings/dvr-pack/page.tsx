import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function DvrPackSettingsPage() {
  return (
    <SettingsPanelForm
      group="dvr-pack"
      title="DVR & Recording Pack"
      description="End-user cloud/local DVR, portal recording management, EPG schedules."
      sections={[
        {
          title: "License",
          fields: [{ key: "enabled", label: "Enable DVR Pack", type: "yesno" }],
        },
        {
          title: "Storage",
          fields: [
            {
              key: "storageMode",
              label: "Storage mode",
              type: "select",
              options: [
                { value: "local", label: "Local disk" },
                { value: "cloud", label: "Cloud / S3-compatible" },
              ],
            },
            { key: "cloudBucketUrl", label: "Cloud bucket URL", placeholder: "s3://bucket/path" },
            { key: "defaultQuotaGb", label: "Default quota per line (GB)", type: "number" },
            { key: "portalRecordingEnabled", label: "Allow recordings from client portal", type: "yesno" },
            { key: "epgScheduleEnabled", label: "EPG-based scheduled recordings", type: "yesno" },
          ],
        },
      ]}
    />
  );
}
