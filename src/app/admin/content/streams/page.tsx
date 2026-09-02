import { Suspense } from "react";
import { StreamsList } from "@/components/streams-list";

export default function ManageStreamsPage() {
  return (
    <Suspense fallback={<p className="text-sm" style={{ color: "var(--muted)" }}>Loading streams…</p>}>
      <StreamsList
        type="LIVE"
        title="Manage Live Streams"
        addHref="/admin/streams/add"
        importHref="/admin/import/m3u"
      />
    </Suspense>
  );
}
