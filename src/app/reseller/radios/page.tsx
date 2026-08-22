import { ResellerStreamsBrowser } from "@/components/reseller-streams-browser";

export default function ResellerRadiosPage() {
  return (
    <ResellerStreamsBrowser
      title="Radio"
      description="Radio stations in your assigned bouquets (read-only)."
      query="type=LIVE&radio=1"
    />
  );
}
