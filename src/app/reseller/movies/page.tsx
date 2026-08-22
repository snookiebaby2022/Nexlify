import { ResellerStreamsBrowser } from "@/components/reseller-streams-browser";

export default function ResellerMoviesPage() {
  return (
    <ResellerStreamsBrowser
      title="Movies"
      description="Movies in your assigned bouquets (read-only)."
      query="type=MOVIE"
    />
  );
}
