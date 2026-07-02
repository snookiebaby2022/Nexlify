import { VodImportForm } from "@/components/vod-import-form";

export default function ImportSeriesPage() {
  return (
    <VodImportForm
      streamType="SERIES"
      title="Import multiple series"
      manageHref="/admin/content/series"
      manageLabel="Manage Series"
    />
  );
}
