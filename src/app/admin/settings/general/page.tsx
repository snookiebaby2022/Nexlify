import { SettingsPanelForm } from "@/components/settings-panel-form";
import { getTimezoneOptions } from "@/lib/timezones";

const TIMEZONE_OPTIONS = getTimezoneOptions();

export default function GeneralSettingsPage() {
  return (
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
  );
}
