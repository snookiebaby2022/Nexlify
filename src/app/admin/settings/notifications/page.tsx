import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function NotificationsSettingsPage() {
  return (
    <SettingsPanelForm
      group="notifications"
      title="Notifications"
      description="Email, SMS (Twilio), and in-panel alerts for subscription and reseller events."
      sections={[
        {
          title: "SMTP email",
          fields: [
            { key: "emailEnabled", label: "Enable email notifications", type: "yesno" },
            { key: "notifyEmail", label: "Admin alert email" },
            { key: "smtpHost", label: "SMTP host" },
            { key: "smtpPort", label: "SMTP port", type: "number" },
            { key: "smtpUser", label: "SMTP user" },
            { key: "smtpPassword", label: "SMTP password", type: "password" },
          ],
        },
        {
          title: "SMS (Twilio)",
          info: "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in .env or below.",
          fields: [
            { key: "smsEnabled", label: "Enable SMS notifications", type: "yesno" },
            { key: "twilioAccountSid", label: "Twilio Account SID" },
            { key: "twilioAuthToken", label: "Twilio Auth Token", type: "password" },
            { key: "twilioFromNumber", label: "Twilio from number", placeholder: "+15551234567" },
            { key: "resellerNotifyPhone", label: "Default SMS recipient" },
          ],
        },
        {
          title: "Subscription events",
          fields: [
            { key: "notifyExpiry", label: "Expiry warnings", type: "yesno" },
            { key: "notifyExpiryDaysBefore", label: "Days before expiry", type: "number" },
            { key: "notifyRenewal", label: "Renewal confirmations", type: "yesno" },
            { key: "notifySuspension", label: "Suspension / expiry", type: "yesno" },
            { key: "smsNotifyExpiry", label: "SMS on expiry warning", type: "yesno" },
            { key: "smsNotifyRenewal", label: "SMS on renewal", type: "yesno" },
            { key: "smsNotifySuspension", label: "SMS on suspension", type: "yesno" },
            { key: "inPanelAlerts", label: "In-panel alerts for resellers", type: "yesno" },
          ],
        },
        {
          title: "Reseller events",
          fields: [
            { key: "notifyNewLine", label: "New line created", type: "yesno" },
            { key: "notifyLowCredits", label: "Low credits", type: "yesno" },
            { key: "notifyLowCreditThreshold", label: "Low credit threshold", type: "number" },
            { key: "smsNotifyLowCredit", label: "SMS on low credits", type: "yesno" },
            { key: "notifyTicketReply", label: "Ticket updates", type: "yesno" },
          ],
        },
      ]}
    />
  );
}
