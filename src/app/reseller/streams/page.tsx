import { ResellerStreamsBrowser } from "@/components/reseller-streams-browser";

export default function ResellerStreamsPage() {
  return (
    <ResellerStreamsBrowser
      title="Streams"
      description="Live channels available in your bouquets (read-only)."
      query="type=LIVE"
    />
  );
}
