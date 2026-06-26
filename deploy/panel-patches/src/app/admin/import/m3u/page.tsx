import { ImportForm } from "@/components/import-form";

export default function ImportM3uPage() {
  return (
    <ImportForm
      title="Import M3U"
      description="Import live channels from M3U URL, file upload, or pasted playlist."
      streamType="LIVE"
      allowFolder={false}
    />
  );
}
