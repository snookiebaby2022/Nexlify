import { SettingsPanelForm } from "@/components/settings-panel-form";
import { TMDB_LANGUAGE_OPTIONS } from "@/lib/tmdb-languages";

export default function TmdbSettingsPage() {
  return (
    <SettingsPanelForm
      group="tmdb"
      title="TMDB / metadata"
      description="The Movie Database API for movie and series metadata."
      sections={[
        {
          title: "API",
          info: "Create a key at themoviedb.org/settings/api. Metadata is fetched when adding or editing VOD.",
          fields: [
            { key: "apiKey", label: "API key", type: "password" },
            {
              key: "language",
              label: "Metadata language",
              type: "select",
              options: TMDB_LANGUAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            },
          ],
        },
        {
          title: "Auto-fetch",
          fields: [
            { key: "enableMovieMeta", label: "Auto-fetch movie metadata", type: "yesno" },
            { key: "enableSeriesMeta", label: "Auto-fetch series metadata", type: "yesno" },
          ],
        },
      ]}
    />
  );
}
