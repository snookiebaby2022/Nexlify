import { StreamsList } from "@/components/streams-list";

export default function MoviesPage() {
  return (
    <StreamsList
      type="MOVIE"
      title="Manage Movies"
      addHref="/admin/content/movies/add"
      importHref="/admin/import/movies"
    />
  );
}
