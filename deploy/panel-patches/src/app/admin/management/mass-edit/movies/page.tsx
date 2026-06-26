import { StreamsMassEdit } from "@/components/streams-mass-edit";

export default function MassEditMoviesPage() {
  return (
    <StreamsMassEdit
      title="Mass edit — movies"
      description="Bulk update movie streams (VOD)."
      typeFilter="MOVIE"
    />
  );
}
