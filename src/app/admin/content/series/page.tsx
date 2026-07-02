import { StreamsList } from "@/components/streams-list";

export default function SeriesPage() {
  return (
    <StreamsList
      type="SERIES"
      title="Manage Series"
      addHref="/admin/content/series/add"
      importHref="/admin/import/series"
    />
  );
}
