import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function NotificationsSettingsPage() {
  return (
    <SettingsPanelForm
      group="notifications"
      title="Notifications"
      description="Email alerts and SMTP configuration."
      sections={[
        {
          title: "SMTP",
          fields: [
            { key: "emailEnabled", label: "Enable email notifications", type: "yesno" },
            { key: "notifyEmail", label: "Send alerts to" },
            { key: "smtpHost", label: "SMTP host" },
            { key: "smtpPort", label: "SMTP port", type: "number" },
            { key: "smtpUser", label: "SMTP user" },
            { key: "smtpPassword", label: "SMTP password", type: "password" },
          ],
        },
        {
          title: "Events",
          fields: [
            { key: "notifyNewLine", label: "New line created", type: "yesno" },
            { key: "notifyLowCredits", label: "Low credits", type: "yesno" },
            { key: "notifyTicketReply", label: "Ticket updates", type: "yesno" },
          ],
        },
      ]}
    />
  );
}
