import { StreamsMassEdit } from "@/components/streams-mass-edit";

export default function MassEditEpisodesPage() {
  return (
    <StreamsMassEdit
      title="Mass edit — episodes"
      description="Bulk update episode entries (series with season/episode)."
      typeFilter="SERIES"
      episodesOnly
    />
  );
}
