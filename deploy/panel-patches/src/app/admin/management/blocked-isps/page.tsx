import { BlocklistPage } from "@/components/blocklist-page";

export default function BlockedIspsPage() {
  return (
    <BlocklistPage
      type="isp"
      title="Blocked ISPs"
      description="Block clients by ISP name (substring match)."
      valueLabel="ISP"
      valuePlaceholder="ISP name or keyword"
    />
  );
}
