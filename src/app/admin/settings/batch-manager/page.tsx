import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function BatchManagerSettingsPage() {
  return (
    <SettingsPanelForm
      group="batch-manager"
      title="Batch Manager"
      description="Batch ActiveCode generation and mass creation of lines, devices, and subscriptions."
      sections={[
        {
          title: "General",
          fields: [
            { key: "batchManagerEnabled", label: "Enable batch manager", type: "yesno", hint: "Master switch for batch operations." },
            { key: "batchManagerDefaultCount", label: "Default batch count", type: "number", placeholder: "100", hint: "Default number of items to create per batch." },
            { key: "batchManagerNotifyOnCreate", label: "Notify on batch creation", type: "yesno", hint: "Send alert when batch is completed." },
          ],
        },
        {
          title: "ActiveCode Generation",
          fields: [
            { key: "batchManagerPrefix", label: "Code prefix", type: "text", placeholder: "NEX", hint: "Prefix for generated ActiveCodes." },
            { key: "batchManagerLength", label: "Code length", type: "number", placeholder: "8", hint: "Total length of generated codes (prefix + random)." },
            { key: "batchManagerExpiryDays", label: "Default expiry (days)", type: "number", placeholder: "30", hint: "Default subscription duration for batch-created lines." },
            { key: "batchManagerMaxConnections", label: "Default max connections", type: "number", placeholder: "1", hint: "Default concurrent connections per line." },
          ],
        },
        {
          title: "Defaults",
          fields: [
            { key: "batchManagerBouquets", label: "Default bouquets", type: "textarea", placeholder: "bouquet-id-1\nbouquet-id-2", hint: "Default bouquet IDs assigned to batch-created lines (one per line)." },
          ],
        },
      ]}
    />
  );
}
