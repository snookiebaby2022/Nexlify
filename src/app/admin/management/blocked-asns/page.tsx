import { BlocklistPage } from "@/components/blocklist-page";

export default function BlockedAsnsPage() {
  return (
    <BlocklistPage
      type="asn"
      title="Blocked ASNs"
      description="Block traffic from autonomous system numbers (e.g. 15169)."
      valueLabel="ASN"
      valuePlaceholder="ASN number or AS15169"
      extraFields={[{ key: "label", label: "Label", placeholder: "Label (optional)" }]}
    />
  );
}
