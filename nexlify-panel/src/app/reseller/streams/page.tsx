"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ResellerStreamsPage() {
  const [streams, setStreams] = useState<{ id: string; name: string; type: string; isActive: boolean }[]>([]);

  useEffect(() => {
    fetch("/api/admin/streams?type=LIVE")
      .then((r) => r.json())
      .then((d) => setStreams((d.streams ?? []).slice(0, 100)));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <h1 className="text-2xl font-semibold flex-1">Streams</h1>
        <Link href="/reseller/modules" className="text-sm" style={{ color: "var(--accent)" }}>← Modules</Link>
      </div>
      <p className="text-sm" style={{ color: "var(--muted)" }}>Read-only preview of live streams in your bouquets.</p>
      <ul className="rounded-lg border divide-y" style={{ borderColor: "var(--border)" }}>
        {streams.map((s) => (
          <li key={s.id} className="px-3 py-2 text-sm flex justify-between">
            <span>{s.name}</span>
            <span style={{ color: "var(--muted)" }}>{s.isActive ? "On" : "Off"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
