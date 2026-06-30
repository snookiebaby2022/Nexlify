import { ResellerStreamsBrowser } from "@/components/reseller-streams-browser";

export default function ResellerEpisodesPage() {
  return (
    <ResellerStreamsBrowser
      title="Episodes"
      description="Series episodes in your bouquets (read-only)."
      query="type=SERIES"
    />
  );
}
