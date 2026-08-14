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
      title="Import live streams"
      description="Paste your IPTV provider M3U URL (get.php / m3u_plus). Channels are imported using tvg-name, tvg-logo, and group-title — categories and bouquets are created automatically."
      streamType="LIVE"
      allowFolder={false}
    />
    </div>
  );
}
