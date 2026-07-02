import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function CronSettingsPage() {
  return (
    <SettingsPanelForm
      group="cron"
      title="Scheduled tasks"
      description="Cron schedules for EPG sync, channel refresh, dead-link probes, and subscription notifications."
      sections={[
        {
          title: "EPG & channels",
          info: "Requires PM2 process nexlify-cron (npm run cron:daemon).",
          fields: [
            { key: "epgSyncEnabled", label: "EPG sync enabled", type: "yesno" },
            { key: "epgSyncCron", label: "EPG sync cron", placeholder: "0 * * * *" },
            { key: "channelRefreshEnabled", label: "Channel metadata refresh", type: "yesno" },
            { key: "channelRefreshCron", label: "Channel refresh cron", placeholder: "0 4 * * *" },
          ],
        },
        {
          title: "Stream health",
          fields: [
            { key: "deadLinkProbeEnabled", label: "Auto probe dead links", type: "yesno" },
            { key: "deadLinkProbeCron", label: "Probe cron", placeholder: "*/15 * * * *" },
          ],
        },
        {
          title: "Notifications",
          fields: [
            { key: "subscriptionNotifyCron", label: "Subscription notify cron", placeholder: "0 8 * * *" },
          ],
        },
      ]}
    />
  );
}
