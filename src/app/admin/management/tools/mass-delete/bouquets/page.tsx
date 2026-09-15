import { MassDeletePanel } from "@/components/mass-delete-panel";

export default function MassDeleteBouquetsPage() {
  return (
    <MassDeletePanel
      entity="bouquets"
      title="Mass delete — bouquets"
      loadUrl="/api/admin/bouquets"
      labelKey="name"
    />
  );
}
