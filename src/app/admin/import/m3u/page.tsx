import { ImportForm } from "@/components/import-form";
import Link from "next/link";

export default function ImportM3uPage() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href="/admin/import/m3u/review"
          className="text-sm underline"
          style={{ color: "var(--accent)" }}
        >
          M3U Stream Review (preview + duplicates)
        </Link>
      </div>
      <ImportForm
      title="Import M3U"
      description="Import live channels from M3U URL, file upload, or pasted playlist."
      streamType="LIVE"
      allowFolder={false}
    />
    </div>
  );
}
