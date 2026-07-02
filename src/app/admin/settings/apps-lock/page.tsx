import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function AppsLockSettingsPage() {
  return (
    <SettingsPanelForm
      group="apps-lock"
      title="Apps Lock Setup"
      description="Restrict subscriptions to specific player apps and block unauthorized clients."
      sections={[
        {
          title: "General",
          fields: [
            { key: "appsLockEnabled", label: "Enable Apps Lock", type: "yesno", hint: "Restrict access to allowed player apps only." },
            { key: "appsLockBlockUnknown", label: "Block unknown apps", type: "yesno", hint: "Reject connections from unlisted applications." },
            { key: "appsLockEnforceOnConnect", label: "Enforce on connect", type: "yesno", hint: "Validate app identity at every connection." },
          ],
        },
        {
          title: "Allowed Apps",
          fields: [
            { key: "appsLockAllowedApps", label: "Allowed app identifiers", type: "textarea", placeholder: "com.nexlify.app\ncom.iptv.smarter\ncom.tivimate", hint: "One app package name per line." },
            { key: "appsLockUserAgentWhitelist", label: "User-agent whitelist", type: "textarea", placeholder: "NexlifyPlayer/1.0\nIPTVSmarters/2.0", hint: "Allowed user-agent strings (one per line). Leave empty to allow all matching package names." },
          ],
        },
        {
          title: "Validation",
          fields: [
            { key: "appsLockMacValidation", label: "MAC address validation", type: "yesno", hint: "Verify device MAC address against allowed list." },
          ],
        },
      ]}
    />
  );
}
