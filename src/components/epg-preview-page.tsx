"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";

type Program = {
  id: string;
  channelId: string;
  title: string;
  start: string;
  stop: string;
  source: { name: string };
};

export function EpgPreviewPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [sources, setSources] = useState<{ id: string; name: string; country: string | null }[]>([]);

  useEffect(() => {
    fetch("/api/reseller/epg-preview")
      .then((r) => r.json())
      .then((d) => {
        setPrograms(d.programs ?? []);
        setSources(d.sources ?? []);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">EPG preview</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Read-only guide data for the next 24 hours ({sources.length} active source
          {sources.length === 1 ? "" : "s"}).
        </p>
      </div>

      {sources.length > 0 && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Sources: {sources.map((s) => s.name).join(", ")}
        </p>
      )}

      <DataTable
        headers={["Channel", "Program", "Starts", "Ends", "Source"]}
        rows={programs.map((p) => [
          p.channelId,
          p.title,
          formatDateTime(p.start),
          formatDateTime(p.stop),
          p.source.name,
        ])}
      />

      {programs.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No EPG programs in the next 24 hours. Ask your administrator to sync EPG sources.
        </p>
      )}
    </div>
  );
}
