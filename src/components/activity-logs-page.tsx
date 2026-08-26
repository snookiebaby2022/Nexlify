"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";
import { LogsPageToolbar } from "@/components/logs-page-toolbar";
import { DEFAULT_LOG_PAGE_SIZE } from "@/lib/log-page";

export function ActivityLogsPage({
  title,
  description,
  actionFilter,
  placeholder = "Search entity, line, user…",
}: {
  title: string;
  description: string;
  actionFilter?: string;
  placeholder?: string;
}) {
  const [logs, setLogs] = useState<
    {
      id: string;
      action: string;
      entity: string | null;
      entityId: string | null;
      createdAt: string;
      user: { username: string } | null;
      line: { username: string } | null;
      meta: unknown;
    }[]
  >([]);
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState(DEFAULT_LOG_PAGE_SIZE);
  const [clearBusy, setClearBusy] = useState(false);

  function load() {
    const params = new URLSearchParams({ limit: String(pageSize) });
    if (actionFilter) params.set("action", actionFilter);
    if (q.trim()) params.set("q", q.trim());
    fetch(`/api/admin/logs?${params}`)
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []));
  }

  useEffect(() => {
    load();
  }, [pageSize]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      </div>
      <LogsPageToolbar
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onRefresh={load}
        clearBusy={clearBusy}
        onClear={async () => {
          if (!confirm("Delete matching log entries? This cannot be undone.")) return;
          setClearBusy(true);
          try {
            const params = new URLSearchParams();
            if (actionFilter) params.set("action", actionFilter);
            if (q.trim()) params.set("q", q.trim());
            await fetch(`/api/admin/logs?${params}`, { method: "DELETE" });
            load();
          } finally {
            setClearBusy(false);
          }
        }}
      >
        <input
          className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[200px]"
          style={{ borderColor: "var(--border)" }}
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
      </LogsPageToolbar>
      <DataTable
        headers={["Time", "Action", "User", "Line", "Entity", "Details"]}
        rows={logs.map((log) => [
          formatDateTime(log.createdAt),
          log.action,
          log.user?.username ?? "—",
          log.line?.username ?? "—",
          log.entity ? `${log.entity}${log.entityId ? ` #${log.entityId.slice(0, 8)}` : ""}` : "—",
          log.meta ? (
            <code key={log.id} className="text-xs break-all">
              {JSON.stringify(log.meta).slice(0, 80)}
            </code>
          ) : (
            "—"
          ),
        ])}
      />
    </div>
  );
}
