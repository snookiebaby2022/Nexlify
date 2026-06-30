import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function AutoFixSettingsPage() {
  return (
    <SettingsPanelForm
      group="auto-fix"
      title="Auto Issue Fixing"
      description="Automatic repair for audio loss, video freeze, loop detection, and source switching."
      sections={[
        {
          title: "General",
          fields: [
            { key: "autoFixEnabled", label: "Enable Auto Fix", type: "yesno", hint: "Master switch for automatic stream repair." },
            { key: "autoFixIntervalSeconds", label: "Check interval (seconds)", type: "number", placeholder: "30", hint: "How often to scan streams for issues." },
            { key: "autoFixMaxRetries", label: "Max retries per issue", type: "number", placeholder: "3", hint: "How many times to attempt repair before alerting." },
          ],
        },
        {
          title: "Repair Types",
          fields: [
            { key: "autoFixAudioLoss", label: "Fix audio loss", type: "yesno", hint: "Auto-detect and restart streams with missing audio." },
            { key: "autoFixVideoFreeze", label: "Fix video freeze", type: "yesno", hint: "Auto-detect and restart frozen video streams." },
            { key: "autoFixLoopDetection", label: "Fix loop detection", type: "yesno", hint: "Detect and break looping streams." },
            { key: "autoFixSourceSwitch", label: "Auto source switch", type: "yesno", hint: "Switch to backup source on failure." },
          ],
        },
        {
          title: "Notifications",
          fields: [
            { key: "autoFixNotifyOnRepair", label: "Notify on repair", type: "yesno", hint: "Send alert when a stream is auto-repaired." },
          ],
        },
      ]}
    />
  );
}
