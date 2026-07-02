import { MassDeletePanel } from "@/components/mass-delete-panel";

export default function MassDeleteMoviesPage() {
  return (
    <MassDeletePanel
      entity="streams"
      streamType="MOVIE"
      title="Mass delete — Movies"
      loadUrl="/api/admin/streams"
      labelKey="name"
    />
  );
}
