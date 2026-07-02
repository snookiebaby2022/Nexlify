import { SettingsPanelForm } from "@/components/settings-panel-form";
import { TMDB_LANGUAGE_OPTIONS } from "@/lib/tmdb-languages";

export default function TmdbSettingsPage() {
  return (
    <SettingsPanelForm
      group="tmdb"
      title="TMDB / metadata"
      description="The Movie Database (TMDB) powers movie/series posters, descriptions, and genre-based categories on import and add-stream forms."
      sections={[
        {
          title: "API credentials",
          info: "Create a free API key at themoviedb.org/settings/api. The key is stored in panel settings and used server-side only — never exposed to clients.",
          fields: [
            { key: "apiKey", label: "API key", type: "password" },
            {
              key: "language",
              label: "Primary metadata language",
              type: "select",
              options: TMDB_LANGUAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              hint: "Titles, overviews, and genres are fetched in this locale.",
            },
            {
              key: "fallbackLanguage",
              label: "Fallback language",
              type: "select",
              options: TMDB_LANGUAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              hint: "Used when primary language has no translation for a title.",
            },
          ],
        },
        {
          title: "Auto-fetch behaviour",
          description: "Control when the panel queries TMDB automatically.",
          fields: [
            {
              key: "enableMovieMeta",
              label: "Auto-fetch movie metadata",
              type: "yesno",
              hint: "Posters and plot on add/import movie flows.",
            },
            {
              key: "enableSeriesMeta",
              label: "Auto-fetch series metadata",
              type: "yesno",
              hint: "Series and episode imports use the show name for TV lookup.",
            },
            {
              key: "autoFetchOnImport",
              label: "Auto-fetch on bulk import",
              type: "yesno",
              hint: "Import Movies/Series pages default this on; disable to skip TMDB during M3U imports.",
            },
            {
              key: "enableLiveEpgMeta",
              label: "Suggest logos from TMDB TV search",
              type: "yesno",
              hint: "Works with Streaming → Auto-fetch channel logos for live channels.",
            },
            {
              key: "preferOriginalTitle",
              label: "Prefer original title",
              type: "yesno",
              hint: "Use original_language title instead of localized name when available.",
            },
            {
              key: "cacheTtlHours",
              label: "Metadata cache TTL (hours)",
              type: "number",
              hint: "Reduces API calls during large imports. 12–48 typical.",
            },
          ],
        },
        {
          title: "Notes",
          fields: [
            {
              key: "notes",
              label: "Operator notes",
              type: "textarea",
              colSpan: 2,
              hint: "Internal notes about your TMDB plan or language preferences.",
            },
          ],
        },
      ]}
    />
  );
}
