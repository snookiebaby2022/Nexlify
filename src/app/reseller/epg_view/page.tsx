"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Program = {
  id: string;
  title: string;
  start: string;
  end: string;
  channelId: string;
};

export default function ResellerEpgPreviewPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/reseller/epg-preview")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPrograms(Array.isArray(d.programs) ? d.programs : []))
      .catch(() => setError("Could not load EPG preview."));
  }, []);

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">EPG Preview</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Read-only guide for channels in your bouquets.{" "}
        <Link href="/reseller/tickets/new" className="underline" style={{ color: "var(--accent)" }}>
          Request EPG changes via ticket
        </Link>
        .
      </p>
      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
      <ul className="rounded-lg border divide-y text-sm" style={{ borderColor: "var(--border)" }}>
        {programs.slice(0, 100).map((p) => (
          <li key={p.id} className="px-3 py-2 flex justify-between gap-3">
            <span className="font-medium truncate">{p.title}</span>
            <span className="text-xs shrink-0" style={{ color: "var(--muted)" }}>
              {new Date(p.start).toLocaleString()} — {p.channelId}
            </span>
          </li>
        ))}
        {!programs.length && !error && (
          <li className="px-3 py-8 text-center" style={{ color: "var(--muted)" }}>
            No EPG data for your bouquets yet.
          </li>
        )}
      </ul>
    </div>
  );
}
