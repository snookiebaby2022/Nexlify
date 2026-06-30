import { ResellerStreamsBrowser } from "@/components/reseller-streams-browser";

export default function ResellerMoviesPage() {
  return (
    <ResellerStreamsBrowser
      title="Movies"
      description="VOD movies in your bouquets (read-only)."
      query="type=MOVIE"
    />
  );
}
