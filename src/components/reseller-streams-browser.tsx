"use client";

import { useEffect, useState } from "react";

type StreamRow = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  category?: { name: string } | null;
};

export function ResellerStreamsBrowser({
  title,
  description,
  query,
}: {
  title: string;
  description: string;
  query: string;
}) {
  const [streams, setStreams] = useState<StreamRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/streams?${query}&lite=1`)
      .then((r) => {
        if (!r.ok) throw new Error("load");
        return r.json();
      })
      .then((d) => setStreams((d.streams ?? []).slice(0, 200)))
      .catch(() => setError("Could not load streams."));
  }, [query]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      </div>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <ul className="rounded-lg border divide-y" style={{ borderColor: "var(--border)" }}>
        {streams.map((s) => (
          <li key={s.id} className="px-3 py-2.5 text-sm flex justify-between gap-3">
            <span>
              {s.name}
              {s.category?.name && (
                <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                  {s.category.name}
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs" style={{ color: s.isActive ? "var(--success)" : "var(--muted)" }}>
              {s.isActive ? "Active" : "Off"}
            </span>
          </li>
        ))}
        {!streams.length && !error && (
          <li className="px-3 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            No streams in this category
          </li>
        )}
      </ul>
    </div>
  );
}
