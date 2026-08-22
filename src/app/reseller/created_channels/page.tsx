import { ResellerStreamsBrowser } from "@/components/reseller-streams-browser";

export default function ResellerCreatedChannelsPage() {
  return (
    <ResellerStreamsBrowser
      title="Created Channels"
      description="Created channels in your assigned bouquets (read-only)."
      query="type=LIVE&created=1"
    />
  );
}
