"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

type WarningPayload = {
  collisionCount: number;
  extraCopies: number;
  examples: { name: string; count: number; categories: string[]; bouquets: string[] }[];
};

export function DuplicateStreamNamesBanner({ type = "LIVE" }: { type?: "LIVE" | "MOVIE" | "SERIES" }) {
  const [data, setData] = useState<WarningPayload | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/streams/duplicate-name-warnings?type=${type}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.collisionCount > 0) {
          setData({
            collisionCount: d.collisionCount,
            extraCopies: d.extraCopies,
            examples: d.examples ?? [],
          });
        }
      })
      .catch(() => {});
  }, [type]);

  if (dismissed || !data?.collisionCount) return null;

  const example = data.examples[0];
  const where =
    example?.categories?.[0] ??
    example?.bouquets?.[0] ??
    "the same category or bouquet";

  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm flex flex-wrap items-start gap-3 justify-between"
      style={{
        borderColor: "rgba(251, 146, 60, 0.35)",
        background: "rgba(251, 146, 60, 0.08)",
        color: "var(--text)",
      }}
      role="status"
    >
      <div className="flex gap-2 min-w-0">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: "#fb923c" }} aria-hidden />
        <div className="min-w-0">
          <p className="font-medium">
            {data.collisionCount} duplicate channel name{data.collisionCount === 1 ? "" : "s"} in shared
            categories/bouquets
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {data.extraCopies} extra row{data.extraCopies === 1 ? "" : "s"} can make probes look OK while apps tune
            the wrong stream (e.g. bad URL duplicate).
            {example ? (
              <>
                {" "}
                Example: <strong>{example.name}</strong> ×{example.count} in {where}.
              </>
            ) : null}
          </p>
          <Link
            href="/admin/management/tools/remove-duplicates?kind=live"
            className="inline-block mt-2 text-xs underline"
            style={{ color: "var(--accent)" }}
          >
            Review duplicates →
          </Link>
        </div>
      </div>
      <button
        type="button"
        className="text-xs shrink-0 px-2 py-1 rounded border"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        onClick={() => setDismissed(true)}
      >
        Dismiss
      </button>
    </div>
  );
}
