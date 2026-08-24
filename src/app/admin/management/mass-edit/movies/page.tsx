import { StreamsMassEdit } from "@/components/streams-mass-edit";

export default function MassEditMoviesPage() {
  return (
    <StreamsMassEdit
      title="Mass edit — movies"
      description="Filter by all categories or one category, then bulk set category, container, adult flag, speed limits, bouquet membership, hosted-by-provider URL, enable/disable, or delete."
      typeFilter="MOVIE"
    />
  );
}
