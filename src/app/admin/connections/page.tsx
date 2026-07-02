"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hammer, Fingerprint } from "lucide-react";
import { IpWithFlag } from "@/components/ip-with-flag";
import { subscriptionPaths } from "@/lib/panel-paths";

function formatConnDuration(startedAt: string, lastSeenAt: string): string {
  const sec = Math.max(
    0,
    Math.floor((new Date(lastSeenAt).getTime() - new Date(startedAt).getTime()) / 1000)
  );
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function inferOutput(userAgent: string | null): string {
  const ua = (userAgent ?? "").toLowerCase();
  if (ua.includes("mpegts") || ua.includes(".ts")) return "MPEGTS";
  if (ua.includes("m3u8") || ua.includes("hls")) return "HLS";
  return "HLS";
}

export default function AdminConnectionsPage() {
  const pathname = usePathname();
  const paths = subscriptionPaths(pathname);

  const [connections, setConnections] = useState<
    {
      id: string;
      ip: string | null;
      userAgent: string | null;
      startedAt: string;
      lastSeenAt: string;
      serverName: string;
      line: { username: string; maxConnections: number; isRestreamer?: boolean };
      stream: { id: string; name: string; type: string } | null;
    }[]
  >([]);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);

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

  const filtered = connections.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.line.username.toLowerCase().includes(q) ||
      (c.ip ?? "").includes(q) ||
      (c.stream?.name ?? "").toLowerCase().includes(q)
    );
  });

  const shown = filtered.slice(0, pageSize);

  return (
    <div className="xui-streams-page space-y-4">
      <div className="xui-streams-topbar">
        <h1 className="xui-streams-title">Live Connections</h1>
        <button type="button" className="xui-streams-btn xui-streams-btn--ghost" onClick={kickAll}>
          {paths.isReseller ? "Clear mine" : "Clear all"}
        </button>
      </div>
      <p className="text-sm px-1" style={{ color: "var(--muted)" }}>
        Active plays in the last 5 minutes. Refreshes every 15s.
        {paths.isReseller ? " Showing your lines only." : ""}
      </p>

      <div className="xui-clients-toolbar">
        <label className="xui-clients-show">
          Show{" "}
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>{" "}
          entries
        </label>
        <label className="xui-clients-search-label">
          Search:{" "}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="xui-clients-search-input"
          />
        </label>
      </div>

      <div className="xui-streams-table-wrap">
        <table className="xui-clients-table xui-clients-table--page">
          <thead>
            <tr>
              <th>Quality</th>
              <th>Line</th>
              <th>Server</th>
              <th>IP</th>
              <th>Duration</th>
              <th>Output</th>
              <th>Restreamer</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="xui-quality-dot" />
                </td>
                <td className="font-semibold">{c.line.username}</td>
                <td>{c.serverName ?? "Main Server"}</td>
                <td>{c.ip ? <IpWithFlag ip={c.ip} /> : "—"}</td>
                <td>
                  <span className="xui-duration-badge">
                    {formatConnDuration(c.startedAt, c.lastSeenAt)}
                  </span>
                </td>
                <td>{inferOutput(c.userAgent)}</td>
                <td>
                  <span
                    className={`xui-restreamer-dot ${c.line.isRestreamer ? "xui-restreamer-dot--yes" : ""}`}
                  />
                </td>
                <td>
                  <div className="xui-clients-actions">
                    <button type="button" className="xui-icon-action" title="Kick" onClick={() => kick(c.id)}>
                      <Hammer size={14} />
                    </button>
                    {c.stream && paths.streamEdit(c.stream.id) ? (
                      <Link href={paths.streamEdit(c.stream.id)!} className="xui-icon-action" title="Stream">
                        <Fingerprint size={14} />
                      </Link>
                    ) : (
                      <button type="button" className="xui-icon-action" title="Details" disabled>
                        <Fingerprint size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="xui-streams-empty">No active connections.</p>
        )}
      </div>

      <div className="xui-streams-footer">
        <span>
          Showing {shown.length ? 1 : 0} to {shown.length} of {filtered.length} entries
        </span>
        <div className="xui-streams-pagination">
          <button type="button" disabled>
            Previous
          </button>
          <span className="xui-streams-page-num">1</span>
          <button type="button" disabled>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
