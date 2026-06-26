import { ImportForm } from "@/components/import-form";

export default function ImportSeriesPage() {
  return (
    <ImportForm
      title="Import TV series"
      description="JSON import file, folder layout (Show / Season 01 / episodes), or M3U. Each episode needs name, source, series_name, season_num, episode_num in JSON."
      streamType="SERIES"
      allowVodFile
    />
  );
}
