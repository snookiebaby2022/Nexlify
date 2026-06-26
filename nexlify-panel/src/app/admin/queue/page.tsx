"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";

type Job = {
  id: string;
  kind: string;
  source: string;
  streamType: string;
  status: string;
  imported: number;
  skipped: number;
  message: string | null;
  createdAt: string;
  completedAt: string | null;
};

export default function ImportQueuePage() {
  const [jobs, setJobs] = useState<Job[]>([]);

  function load() {
    fetch("/api/admin/import-queue")
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []));
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Import queue</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Watch-folder scans and manual imports run via cron (
          <code className="font-mono text-xs">/api/cron</code> or{" "}
          <code className="font-mono text-xs">npm run cron</code>).
        </p>
        <Link href="/admin/watch-folders" className="text-sm mt-2 inline-block" style={{ color: "var(--accent)" }}>
          Watch folders →
        </Link>
      </div>
      <DataTable
        headers={["Status", "Kind", "Type", "Source", "Imported", "Message", "Created"]}
        rows={jobs.map((j) => [
          j.status,
          j.kind,
          j.streamType,
          <span key={j.id} className="font-mono text-xs truncate max-w-[14rem] block">
            {j.source}
          </span>,
          `${j.imported} / skip ${j.skipped}`,
          j.message ?? "—",
          formatDateTime(j.createdAt),
        ])}
      />
    </div>
  );
}
