import { StreamsMassEdit } from "@/components/streams-mass-edit";

export default function MassEditSeriesPage() {
  return (
    <StreamsMassEdit
      title="Mass edit — TV series"
      description="Bulk update series entries. Filter by category, set category, bouquet, container, adult flag, enable/disable, or delete."
      typeFilter="SERIES"
      seriesSeedsOnly
    />
  );
}
