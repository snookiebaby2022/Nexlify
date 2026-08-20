import { StreamsMassEdit } from "@/components/streams-mass-edit";

export default function MassEditEpisodesPage() {
  return (
    <StreamsMassEdit
      title="Mass edit — episodes"
      description="Filter episodes by category, series name, or bouquet. Bulk set category, series name, container, adult flag, bouquet, enable/disable, or delete."
      typeFilter="SERIES"
      episodesOnly
    />
  );
}
