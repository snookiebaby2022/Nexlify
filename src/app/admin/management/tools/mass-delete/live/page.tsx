import { MassDeletePanel } from "@/components/mass-delete-panel";

export default function MassDeleteLivePage() {
  return (
    <MassDeletePanel
      entity="streams"
      streamType="LIVE"
      title="Mass delete — Live streams"
      loadUrl="/api/admin/streams"
      labelKey="name"
    />
  );
}
