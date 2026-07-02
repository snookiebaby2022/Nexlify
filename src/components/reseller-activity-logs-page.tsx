"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";
import { formatAuditAction } from "@/lib/audit-log";

type LogRow = {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  createdAt: string;
  line: { username: string } | null;
};

export function ResellerActivityLogsPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/reseller/activity-logs")
      .then((r) => {
        if (!r.ok) throw new Error("load");
        return r.json();
      })
      .then((d) => setRows(d.logs ?? []))
      .catch(() => setError("Could not load activity log."));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity log</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Recent actions on your reseller account and lines.
        </p>
      </div>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <DataTable
        headers={["When", "Action", "Line", "Entity"]}
        rows={rows.map((r) => [
          formatDateTime(r.createdAt),
          formatAuditAction(r.action),
          r.line?.username ?? "—",
          r.entity ?? "—",
        ])}
      />
    </div>
  );
}
