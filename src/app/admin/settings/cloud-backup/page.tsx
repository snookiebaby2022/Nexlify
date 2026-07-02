import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function CloudBackupSettingsPage() {
  return (
    <SettingsPanelForm
      group="cloud-backup"
      title="Cloud Backup"
      description="xDrive encrypted cloud backup and Dropbox support for panel data and media."
      sections={[
        {
          title: "General",
          fields: [
            { key: "cloudBackupEnabled", label: "Enable cloud backup", type: "yesno", hint: "Master switch for cloud backup operations." },
            { key: "cloudBackupProvider", label: "Backup provider", type: "select", options: [{ value: "s3", label: "Amazon S3" }, { value: "dropbox", label: "Dropbox" }, { value: "xdrive", label: "xDrive" }], hint: "Select your cloud backup provider." },
            { key: "cloudBackupSchedule", label: "Backup schedule (cron)", type: "text", placeholder: "0 3 * * *", hint: "Cron expression for automatic backups." },
            { key: "cloudBackupRetentionDays", label: "Retention (days)", type: "number", placeholder: "30", hint: "How long to keep backup files." },
          ],
        },
        {
          title: "Backup Content",
          fields: [
            { key: "cloudBackupIncludeDb", label: "Include database", type: "yesno", hint: "Backup PostgreSQL database dumps." },
            { key: "cloudBackupIncludeMedia", label: "Include media", type: "yesno", hint: "Backup VOD media files (large)." },
          ],
        },
        {
          title: "xDrive",
          fields: [
            { key: "xDriveEnabled", label: "Enable xDrive", type: "yesno", hint: "Use xDrive encrypted cloud storage." },
            { key: "xDriveApiKey", label: "xDrive API key", type: "password", placeholder: "xdrv_...", hint: "Your xDrive API key." },
            { key: "xDriveEndpoint", label: "xDrive endpoint", type: "text", placeholder: "https://api.xdrive.io/v1", hint: "xDrive API endpoint URL." },
          ],
        },
        {
          title: "Dropbox",
          fields: [
            { key: "cloudBackupDropboxToken", label: "Dropbox access token", type: "password", placeholder: "sl....", hint: "Dropbox OAuth access token." },
          ],
        },
        {
          title: "S3 Compatible",
          fields: [
            { key: "cloudBackupS3Bucket", label: "S3 bucket", type: "text", placeholder: "my-backup-bucket", hint: "S3 bucket name." },
            { key: "cloudBackupS3Region", label: "S3 region", type: "text", placeholder: "us-east-1", hint: "AWS region." },
            { key: "cloudBackupS3AccessKey", label: "S3 access key", type: "password", placeholder: "AKIA...", hint: "AWS access key ID." },
            { key: "cloudBackupS3SecretKey", label: "S3 secret key", type: "password", placeholder: "...", hint: "AWS secret access key." },
          ],
        },
      ]}
    />
  );
}
