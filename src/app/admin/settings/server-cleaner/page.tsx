import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function ServerCleanerSettingsPage() {
  return (
    <SettingsPanelForm
      group="server-cleaner"
      title="Server Cleaner"
      description="Automated log, temp file, and cache cleanup to keep servers running efficiently."
      sections={[
        {
          title: "General",
          fields: [
            { key: "cleanerEnabled", label: "Enable server cleaner", type: "yesno", hint: "Master switch for automated cleanup." },
            { key: "cleanerSchedule", label: "Cleanup schedule (cron)", type: "text", placeholder: "0 2 * * *", hint: "When to run the cleanup job." },
            { key: "cleanerDryRun", label: "Dry run mode", type: "yesno", hint: "Preview what would be deleted without actually removing files." },
          ],
        },
        {
          title: "Retention Policies",
          fields: [
            { key: "cleanerLogRetentionDays", label: "Log retention (days)", type: "number", placeholder: "7", hint: "Keep logs for this many days." },
            { key: "cleanerTempRetentionHours", label: "Temp file retention (hours)", type: "number", placeholder: "24", hint: "Keep temp files for this many hours." },
            { key: "cleanerCacheRetentionHours", label: "Cache retention (hours)", type: "number", placeholder: "48", hint: "Keep cached files for this many hours." },
            { key: "cleanerStreamLogsRetentionDays", label: "Stream logs retention (days)", type: "number", placeholder: "14", hint: "Keep stream logs for this many days." },
            { key: "cleanerPanelLogsRetentionDays", label: "Panel logs retention (days)", type: "number", placeholder: "30", hint: "Keep panel logs for this many days." },
          ],
        },
        {
          title: "Advanced",
          fields: [
            { key: "cleanerCoreDumpEnabled", label: "Clean core dumps", type: "yesno", hint: "Remove crash dump files." },
            { key: "cleanerOrphanedFiles", label: "Clean orphaned files", type: "yesno", hint: "Remove files no longer referenced by the database." },
          ],
        },
      ]}
    />
  );
}
