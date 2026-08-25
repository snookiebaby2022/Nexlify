import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function VodStorageSettingsPage() {
  return (
    <SettingsPanelForm
      group="vod-storage"
      title="Rclone / S3 VOD storage"
      description="Point the panel at a remote library (rclone remote or S3-compatible bucket) the same way 1-Stream’s rclone plugin works. Watch folders can ingest from this path."
      sections={[
        {
          title: "Rclone",
          info: "Mount with rclone mount <remote> /mnt/nexlify-vod then add that folder as a watch folder. Same idea as 1-Stream’s rclone plugin.",
          fields: [
            { key: "rcloneRemote", label: "rclone remote", placeholder: "gdrive:nexlify-vod" },
            { key: "rclonePath", label: "Sub-path", placeholder: "/movies" },
            {
              key: "localMountPath",
              label: "Local mount path",
              placeholder: "/mnt/nexlify-vod",
            },
          ],
        },
        {
          title: "S3 compatible",
          fields: [
            { key: "s3Endpoint", label: "Endpoint", placeholder: "https://s3.amazonaws.com" },
            { key: "s3Bucket", label: "Bucket" },
            { key: "s3Region", label: "Region", placeholder: "eu-west-1" },
            { key: "s3AccessKey", label: "Access key" },
            { key: "s3SecretKey", label: "Secret key", type: "password" },
          ],
        },
      ]}
    />
  );
}
