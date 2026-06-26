import { BlocklistPage } from "@/components/blocklist-page";

export default function BlockedIpsPage() {
  return (
    <BlocklistPage
      type="ip"
      title="Blocked IPs"
      description="Block single IPs or CIDR ranges from accessing streams."
      valueLabel="IP / CIDR"
      valuePlaceholder="203.0.113.10 or 10.0.0.0/8"
      extraFields={[{ key: "label", label: "Label", placeholder: "Label (optional)" }]}
    />
  );
}
