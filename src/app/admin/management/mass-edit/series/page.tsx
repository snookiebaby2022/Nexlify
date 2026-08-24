import { StreamsMassEdit } from "@/components/streams-mass-edit";

export default function MassEditSeriesPage() {
  return (
    <StreamsMassEdit
      title="Mass edit — TV series"
      description="Bulk update series entries. Filter by all categories or one category, set hosted-by-provider URL, category, bouquet, container, adult flag, enable/disable, or delete."
      typeFilter="SERIES"
      seriesSeedsOnly
    />
  );
}
