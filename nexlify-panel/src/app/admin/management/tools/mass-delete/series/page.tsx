import { MassDeletePanel } from "@/components/mass-delete-panel";

export default function MassDeleteSeriesPage() {
  return (
    <MassDeletePanel
      entity="streams"
      streamType="SERIES"
      title="Mass delete — TV series"
      loadUrl="/api/admin/streams"
      labelKey="name"
    />
  );
}
