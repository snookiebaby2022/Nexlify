import { SettingsPanelForm } from "@/components/settings-panel-form";
import { LiveSportsSettingsSection } from "@/components/settings-live-sports-section";
import { getTimezoneOptions } from "@/lib/timezones";

const TIMEZONE_OPTIONS = getTimezoneOptions();

export default function GeneralSettingsPage() {
  return (
    <div className="space-y-8 pb-20">
      <SettingsPanelForm
        group="general"
        title="General settings"
        description="Panel branding and global behaviour."
        sections={[
        {
          title: "Panel",
          fields: [
            { key: "panelName", label: "Panel name" },
            { key: "panelUrl", label: "Panel URL", placeholder: "https://panel.example.com" },
            {
              key: "timezone",
              label: "Timezone",
              type: "select",
              options: TIMEZONE_OPTIONS,
            },
            {
              key: "timeFormat",
              label: "Time format",
              type: "select",
              options: [
                { value: "24", label: "24-hour (22:30)" },
                { value: "12", label: "12-hour (10:30 PM)" },
              ],
              hint: "EPG times in player_api, xmltv.php, and the built-in web player.",
            },
            { key: "defaultLanguage", label: "Default language" },
          ],
        },
        {
          title: "Disable free trial",
          fields: [{ key: "disableTrial", label: "Disable free trial", type: "yesno" }],
        },
        {
          title: "Maintenance",
          info: "When enabled, only administrators can access the panel. Player APIs may still respond depending on your edge config.",
          fields: [{ key: "maintenanceMode", label: "Maintenance mode", type: "yesno" }],
        },
      ]}
      />
      <LiveSportsSettingsSection />
    </div>
  );
}
