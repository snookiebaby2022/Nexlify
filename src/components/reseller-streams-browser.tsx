"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
  const [emptyBouquets, setEmptyBouquets] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bRes = await fetch("/api/reseller/bouquets");
        const bData = await bRes.json().catch(() => ({}));
        const bouquets = Array.isArray(bData.bouquets) ? bData.bouquets : [];
        if (!bRes.ok) throw new Error("bouquets");
        if (!bouquets.length) {
          if (!cancelled) {
            setEmptyBouquets(true);
            setStreams([]);
            setError("");
          }
          return;
        }
        const res = await fetch(`/api/admin/streams?${query}&lite=1`);
        if (!res.ok) throw new Error("streams");
        const d = await res.json();
        if (!cancelled) {
          setEmptyBouquets(false);
          setStreams((d.streams ?? []).slice(0, 200));
        }
      } catch {
        if (!cancelled) setError("Could not load streams.");
      }
    })();
    return () => {
      cancelled = true;
    };
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
      {emptyBouquets && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          No bouquets are assigned to your account yet. Ask an admin to grant bouquet access (
          <Link href="/reseller/tickets/new" className="underline" style={{ color: "var(--accent)" }}>
            open a ticket
          </Link>
          ).
        </div>
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
        {!streams.length && !error && !emptyBouquets && (
          <li className="px-3 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            No streams in this category
          </li>
        )}
      </ul>
    </div>
  );
}
