import { VodImportForm } from "@/components/vod-import-form";

export default function ImportMoviesPage() {
  return (
    <VodImportForm
      streamType="MOVIE"
      title="Import multiple movies"
      manageHref="/admin/content/movies"
      manageLabel="Manage Movies"
    />
  );
}
