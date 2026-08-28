import { Suspense } from "react";
import { StreamsList } from "@/components/streams-list";
import { bootstrapAdminStreamsPage } from "@/lib/admin-streams-bootstrap";

export default async function ManageStreamsPage() {
  const initialBootstrap = await bootstrapAdminStreamsPage({ type: "LIVE" });

  return (
    <Suspense fallback={<p className="text-sm" style={{ color: "var(--muted)" }}>Loading streams…</p>}>
      <StreamsList
        type="LIVE"
        title="Manage Live Streams"
        addHref="/admin/streams/add"
        importHref="/admin/import/m3u"
        initialBootstrap={initialBootstrap}
      />
    </Suspense>
  );
}
