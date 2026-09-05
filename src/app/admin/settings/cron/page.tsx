import { SettingsPanelForm } from "@/components/settings-panel-form";
import { TmdbBackfillBanner } from "@/components/tmdb-backfill-banner";
import { PlexAutoSyncStatus } from "@/components/plex-auto-sync-status";

export default function CronSettingsPage() {
  return (
    <SettingsPanelForm
      group="cron"
      title="Scheduled tasks"
      description="Cron schedules for EPG sync, M3U provider sync, Plex library sync, channel refresh, dead-link probes, and subscription notifications."
      topContent={
        <div className="space-y-3">
          <TmdbBackfillBanner />
          <PlexAutoSyncStatus />
        </div>
      }
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
          title: "Provider content",
          info: "M3U auto-sync jobs run each minute when due (Admin → M3U Auto-Sync or Watch Folders with provider URL + auto-scan interval).",
          fields: [],
        },
        {
          title: "Stream health",
          fields: [
            { key: "deadLinkProbeEnabled", label: "Auto probe dead links", type: "yesno", hint: "Off by default. Use Diagnostics or click a stream to probe." },
            { key: "deadLinkProbeCron", label: "Probe cron", placeholder: "*/15 * * * *" },
          ],
        },
        {
          title: "Plex",
          info: "Plex is included with bundled feature packs. Huge libraries (80k+ rows) auto-sync recent titles only unless Force full auto-sync is on.",
          fields: [
          { key: "plexSyncEnabled", label: "Plex library auto-sync", type: "yesno" },
          {
            key: "plexSyncSchedule",
            label: "Plex sync interval",
            type: "select",
            options: [
              { value: "6h", label: "Every 6 hours" },
              { value: "12h", label: "Every 12 hours" },
              { value: "24h", label: "Every 24 hours" },
            ],
          },
          {
            key: "plexSyncForceLarge",
            label: "Force full auto-sync on huge libraries",
            type: "yesno",
            hint: "Off (recommended): libraries with 80k+ Plex rows use recent-only auto-sync. On: full library walk (can stall cron).",
          },
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
