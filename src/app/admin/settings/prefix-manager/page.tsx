import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function PrefixManagerSettingsPage() {
  return (
    <SettingsPanelForm
      group="prefix-manager"
      title="Prefix Manager + Logo DNS Changer"
      description="Bulk rebranding tool for channel names, logos, and DNS changes across your entire content library."
      sections={[
        {
          title: "General",
          fields: [
            { key: "prefixManagerEnabled", label: "Enable prefix manager", type: "yesno", hint: "Master switch for bulk rebranding." },
            { key: "prefixManagerBulkApply", label: "Bulk apply on save", type: "yesno", hint: "Apply changes to all matching content immediately." },
            { key: "prefixManagerPreserveOriginal", label: "Preserve original names", type: "yesno", hint: "Keep original names as aliases." },
          ],
        },
        {
          title: "Prefixes",
          fields: [
            { key: "prefixManagerChannelPrefix", label: "Channel prefix", type: "text", placeholder: "[BRAND] ", hint: "Text added before channel names." },
            { key: "prefixManagerMoviePrefix", label: "Movie prefix", type: "text", placeholder: "[BRAND] ", hint: "Text added before movie titles." },
            { key: "prefixManagerSeriesPrefix", label: "Series prefix", type: "text", placeholder: "[BRAND] ", hint: "Text added before series titles." },
          ],
        },
        {
          title: "Logo & DNS",
          fields: [
            { key: "prefixManagerLogoDns", label: "Logo DNS domain", type: "text", placeholder: "logo.yourbrand.com", hint: "Domain for channel logos (replaces all logo URLs)." },
          ],
        },
      ]}
    />
  );
}
