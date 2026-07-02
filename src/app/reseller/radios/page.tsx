import { ResellerStreamsBrowser } from "@/components/reseller-streams-browser";

export default function Page() {
  return (
    <ResellerStreamsBrowser
      title="Radio stations"
      description="Radio streams in your bouquets (read-only)."
      query="radio=1"
    />
  );
}
