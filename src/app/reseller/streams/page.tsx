import { ResellerStreamsBrowser } from "@/components/reseller-streams-browser";

export default function ResellerStreamsPage() {
  return (
    <ResellerStreamsBrowser
      title="Live Streams"
      description="Channels in your assigned bouquets (read-only)."
      query="type=LIVE"
    />
  );
}
