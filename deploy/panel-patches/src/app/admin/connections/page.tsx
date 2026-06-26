"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";
import { IpWithFlag } from "@/components/ip-with-flag";
import { subscriptionPaths } from "@/lib/panel-paths";

export default function AdminConnectionsPage() {
  const pathname = usePathname();
  const paths = subscriptionPaths(pathname);

  const [connections, setConnections] = useState<
    {
      id: string;
      ip: string | null;
      userAgent: string | null;
      lastSeenAt: string;
      line: { username: string; maxConnections: number };
      stream: { id: string; name: string; type: string } | null;
    }[]
  >([]);

  function load() {
    fetch("/api/admin/connections")
      .then((r) => r.json())
      .then((d) => setConnections(d.connections));
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  async function kick(id: string) {
    await fetch(`/api/admin/connections?id=${id}`, { method: "DELETE" });
    load();
  }

  async function kickAll() {
    if (!confirm(paths.isReseller ? "Clear all your active connections?" : "Clear all active connections?")) {
      return;
    }
    await fetch("/api/admin/connections?id=all", { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Live connections</h1>
        <button
          type="button"
          onClick={kickAll}
          className="text-sm px-3 py-2 rounded border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
        >
          {paths.isReseller ? "Clear mine" : "Clear all"}
        </button>
      </div>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Active plays in the last 5 minutes. Refreshes every 15s.
        {paths.isReseller ? " Showing your lines only." : ""}
      </p>
      <DataTable
        headers={["Line", "Watching channel", "IP", "User agent", "Last seen", ""]}
        rows={connections.map((c) => [
          `${c.line.username} (${c.line.maxConnections} max)`,
          c.stream ? (
            paths.streamEdit(c.stream.id) ? (
              <Link
                key={`s-${c.id}`}
                href={paths.streamEdit(c.stream.id)!}
                className="hover:underline"
                style={{ color: "var(--accent)" }}
              >
                {c.stream.name}
                <span className="text-xs ml-1" style={{ color: "var(--muted)" }}>
                  ({c.stream.type})
                </span>
              </Link>
            ) : (
              <span key={`s-${c.id}`}>
                {c.stream.name}
                <span className="text-xs ml-1" style={{ color: "var(--muted)" }}>
                  ({c.stream.type})
                </span>
              </span>
            )
          ) : (
            "—"
          ),
          c.ip ? <IpWithFlag key={`ip-${c.id}`} ip={c.ip} /> : "—",
          <span key={c.id} className="truncate max-w-[200px] block text-xs">
            {c.userAgent ?? "—"}
          </span>,
          formatDateTime(c.lastSeenAt),
          <button
            key={`k-${c.id}`}
            type="button"
            className="text-xs cursor-pointer"
            style={{ color: "var(--danger)" }}
            onClick={() => kick(c.id)}
          >
            Kick
          </button>,
        ])}
      />
    </div>
  );
}
