"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ResellerEpisodesPage() {
  const [items, setItems] = useState<{ id: string; name: string; seriesName?: string }[]>([]);

  useEffect(() => {
    fetch("/api/admin/streams?type=SERIES")
      .then((r) => r.json())
      .then((d) => setItems((d.streams ?? []).filter((s: { episodeNum?: number }) => s.episodeNum != null).slice(0, 80)));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Episodes</h1>
      <ul className="text-sm space-y-1">
        {items.map((e) => (
          <li key={e.id}>{e.name}</li>
        ))}
      </ul>
      <Link href="/reseller/modules" className="text-sm" style={{ color: "var(--accent)" }}>← Modules</Link>
    </div>
  );
}
