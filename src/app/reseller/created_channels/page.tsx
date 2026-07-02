import { ResellerStreamsBrowser } from "@/components/reseller-streams-browser";

export default function Page() {
  return (
    <ResellerStreamsBrowser
      title="Created channels"
      description="Custom / restream channels available in your bouquets (read-only)."
      query="type=LIVE&created=1"
    />
  );
}
