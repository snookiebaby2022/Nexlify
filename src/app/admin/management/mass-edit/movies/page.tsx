import { StreamsMassEdit } from "@/components/streams-mass-edit";

export default function MassEditMoviesPage() {
  return (
    <StreamsMassEdit
      title="Mass edit — movies"
      description="Filter by category or bouquet, then bulk set category, container, adult flag, speed limits, bouquet membership, enable/disable, or delete."
      typeFilter="MOVIE"
    />
  );
}
