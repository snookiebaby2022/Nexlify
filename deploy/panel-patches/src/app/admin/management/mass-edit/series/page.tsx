import { StreamsMassEdit } from "@/components/streams-mass-edit";

export default function MassEditSeriesPage() {
  return (
    <StreamsMassEdit
      title="Mass edit — TV series"
      description="Bulk update series-type streams."
      typeFilter="SERIES"
      episodesOnly={false}
    />
  );
}
