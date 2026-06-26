import { ImportForm } from "@/components/import-form";

export default function ImportMoviesPage() {
  return (
    <ImportForm
      title="Import movies"
      description="JSON import file (recommended), M3U playlist, or folder scan. File paths must be under MEDIA_IMPORT_ROOT on the server."
      streamType="MOVIE"
      allowVodFile
    />
  );
}
