"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ResellerMoviesPage() {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/admin/streams?type=MOVIE")
      .then((r) => r.json())
      .then((d) => setItems((d.streams ?? []).slice(0, 80)));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Movies</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>VOD library preview.</p>
      <ul className="text-sm space-y-1">
        {items.map((m) => (
          <li key={m.id}>{m.name}</li>
        ))}
      </ul>
      <Link href="/reseller/modules" className="text-sm" style={{ color: "var(--accent)" }}>← Modules</Link>
    </div>
  );
}
