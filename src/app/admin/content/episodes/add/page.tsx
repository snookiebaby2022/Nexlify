import { VodEpisodeForm } from "@/components/vod-episode-form";

export default async function AddEpisodePage({
  searchParams,
}: {
  searchParams: Promise<{ seriesId?: string }>;
}) {
  const { seriesId } = await searchParams;
  return (
    <div className="space-y-6">
      <VodEpisodeForm initialSeriesId={seriesId} />
    </div>
  );
}
