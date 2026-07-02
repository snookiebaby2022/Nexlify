"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";

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

  function load() {
    const params = new URLSearchParams({ limit: "200" });
    if (actionFilter) params.set("action", actionFilter);
    if (q.trim()) params.set("q", q.trim());
    fetch(`/api/admin/logs?${params}`)
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <input
          className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[200px]"
          style={{ borderColor: "var(--border)" }}
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button
          type="button"
          onClick={load}
          className="rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Search
        </button>
      </div>
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
