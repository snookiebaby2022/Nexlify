"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  ArrowUpDown,
  Filter,
  List,
  RefreshCw,
  Search,
  ShoppingCart,
  PackagePlus,
} from "lucide-react";
import { LineRowActionsMenu } from "@/components/line-row-actions-menu";
import { LineEditForm } from "@/components/line-edit-form";
import { CopyableCredential } from "@/components/copyable-credential";
import { ConnInfoCell, LastWatchedCell } from "@/components/line-last-watched-cell";
import { formatDateTime, formatExpireXui } from "@/lib/format";

export type ManageLineRow = {
  id: string;
  displayId?: number;
  username: string;
  password: string;
  status: string;
  maxConnections: number;
  expiresAt: string;
  createdAt: string;
  externalId?: string | null;
  lockToIp?: boolean;
  isRestreamer?: boolean;
  isTrial?: boolean;
  notes?: string | null;
  owner?: { id: string; username: string } | null;
  lastWatchedAt?: string | null;
  lastWatchedIp?: string | null;
  lastWatchedStream?: { id: string; name: string } | null;
  activeConnection?: {
    ip?: string | null;
    streamName?: string | null;
    userAgent?: string | null;
    lastSeenAt?: string;
  } | null;
  bouquets: { bouquet: { id: string; name: string } }[];
  _count?: { channelWatches?: number; liveConnections?: number };
};
const PAGE_SIZES = [10, 25, 50, 100];

function splitNotes(notes: string | null | undefined) {
  if (!notes?.trim()) return { admin: "", reseller: "" };
  const parts = notes.split("\n---\n");
  return { admin: parts[0]?.trim() ?? "", reseller: parts[1]?.trim() ?? "" };
}

function isTrialLine(line: ManageLineRow) {
  if (line.isTrial != null) return line.isTrial;
  const created = new Date(line.createdAt).getTime();
  const exp = new Date(line.expiresAt).getTime();
  const days = (exp - created) / 86400000;
  return days <= 2.5;
}
function XuiPill({
  value,
  variant,
}: {
  value: string;
  variant: "yes" | "no" | "unlimited";
}) {
  return <span className={`xui-pill xui-pill--${variant}`}>{value}</span>;
}

function NoteBtn({ label, hasNote }: { label: string; hasNote: boolean }) {
  return (
    <span className={`xui-note-btn ${hasNote ? "xui-note-btn--has" : ""}`}>{hasNote ? label : "NO NOTE"}</span>
  );
}

export function ManageLinesTable({
  lines,
  bouquets,
  editLineId,
  onRefresh,
  panel = "admin",
}: {
  lines: ManageLineRow[];
  bouquets: { id: string; name: string }[];
  editLineId?: string | null;
  onRefresh: () => void;
  panel?: "admin" | "reseller";
}) {
  const router = useRouter();
  const base = panel === "reseller" ? "/reseller" : "/admin";
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [pageSize, setPageSize] = useState(100);  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const isMdUp = useMediaQuery("(min-width: 768px)");
  const [bulk, setBulk] = useState("");
  const [sortKey, setSortKey] = useState<"username" | "expiresAt" | "owner">("username");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function closeEdit() {
    router.push(`${base}/lines`);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = lines;
    if (q) {
      list = list.filter(
        (l) =>
          l.username.toLowerCase().includes(q) ||
          l.password.toLowerCase().includes(q) ||
          l.id.toLowerCase().includes(q) ||
          (l.owner?.username?.toLowerCase().includes(q) ?? false) ||
          (l.externalId?.toLowerCase().includes(q) ?? false) ||
          (l.lastWatchedStream?.name?.toLowerCase().includes(q) ?? false) ||
          (l.lastWatchedIp?.toLowerCase().includes(q) ?? false) ||
          l.bouquets.some((b) => b.bouquet.name.toLowerCase().includes(q))
      );
    }    list = [...list].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "username") {
        av = a.username.toLowerCase();
        bv = b.username.toLowerCase();
      } else if (sortKey === "owner") {
        av = a.owner?.username?.toLowerCase() ?? "";
        bv = b.owner?.username?.toLowerCase() ?? "";
      } else {
        av = new Date(a.expiresAt).getTime();
        bv = new Date(b.expiresAt).getTime();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [lines, search, sortKey, sortDir]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => onRefresh(), 30_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, onRefresh]);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleAll(checked: boolean) {
    if (checked) setSelected(new Set(pageRows.map((l) => l.id)));
    else setSelected(new Set());
  }

  async function runBulk() {
    if (!bulk || selected.size === 0) return;
    const ids = [...selected];
    if (bulk === "disable") {
      for (const id of ids) {
        await fetch(`/api/admin/lines/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "DISABLED" }),
        });
      }
    } else if (bulk === "delete") {
      if (!confirm(`Delete ${ids.length} line(s)?`)) return;
      for (const id of ids) {
        await fetch(`/api/admin/lines/${id}`, { method: "DELETE" });
      }
    }
    setBulk("");
    setSelected(new Set());
    onRefresh();
  }

  const SortHead = ({ label, col }: { label: string; col: typeof sortKey }) => (
    <th className="xui-lines-th" onClick={() => toggleSort(col)}>
      <span className="inline-flex items-center gap-0.5">
        {label}
        <ArrowUpDown size={10} className="opacity-40" />
      </span>
    </th>
  );

  function renderRowCells(l: ManageLineRow) {
    const exp = formatExpireXui(l.expiresAt);
    const notes = splitNotes(l.notes);
    const pkg = l.bouquets[0]?.bouquet.name ?? "—";
    const activeConn = (l as { activeConnectionCount?: number }).activeConnectionCount ?? l._count?.liveConnections ?? 0;
    const isActive = l.status === "ACTIVE" && new Date(l.expiresAt) > new Date();

    return (
      <>
        <td className="xui-lines-td xui-lines-td--check">
          <input
            type="checkbox"
            autoComplete="off"
            data-1p-ignore
            checked={selected.has(l.id)}
            onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(l.id);
              else next.delete(l.id);
              setSelected(next);
            }}
          />
        </td>
        <td className="xui-lines-td text-center">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            title={isActive ? "Active" : l.status}
            style={{ background: isActive ? "#22c55e" : l.status === "BANNED" ? "#ef4444" : "#9ca3af" }}
          />
        </td>
        <td className="xui-lines-td min-w-[7rem]">
          <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
            <Link href={`${base}/lines?edit=${l.id}`} className="xui-lines-username truncate">
              {l.username}
            </Link>
            <CopyableCredential value={l.username} className="shrink-0 [&>code]:sr-only" />
          </span>
        </td>
        <td className="xui-lines-td min-w-[6rem]">
          <CopyableCredential value={l.password} masked />
        </td>
        {panel === "admin" ? (
          <td className="xui-lines-td text-xs" style={{ color: "var(--muted)" }}>
            {l.owner?.username ?? "admin"}
          </td>
        ) : null}
        <td className="xui-lines-td whitespace-nowrap text-xs">
          {exp.kind === "unlimited" ? (
            <XuiPill value="UNLIMITED" variant="unlimited" />
          ) : exp.kind === "expired" ? (
            <span className="text-red-400">{exp.text}</span>
          ) : (
            <span>{exp.text}</span>
          )}
        </td>
        <td className="xui-lines-td">
          <XuiPill value={l.status === "BANNED" ? "YES" : "NO"} variant={l.status === "BANNED" ? "yes" : "no"} />
        </td>
        <td className="xui-lines-td text-xs max-w-[8rem] truncate" title={pkg}>
          {pkg}
        </td>
        <td className="xui-lines-td">
          <XuiPill value={isTrialLine(l) ? "YES" : "NO"} variant={isTrialLine(l) ? "yes" : "no"} />
        </td>
        <td className="xui-lines-td tabular-nums text-xs text-center whitespace-nowrap">
          {activeConn}/{l.maxConnections}
        </td>
        <td className="xui-lines-td min-w-[9rem]">
          <ConnInfoCell activeConnection={l.activeConnection} />
        </td>
        <td className="xui-lines-td min-w-[11rem]">
          <LastWatchedCell
            streamName={l.lastWatchedStream?.name}
            ip={l.lastWatchedIp ?? l.activeConnection?.ip}
            watchedAt={l.lastWatchedAt}
          />
        </td>
        <td className="xui-lines-td">
          <div className="flex flex-col gap-0.5">
            {panel === "admin" && <NoteBtn label="Admin" hasNote={Boolean(notes.admin)} />}
            <NoteBtn label={panel === "reseller" ? "Note" : "Reseller"} hasNote={Boolean(notes.reseller)} />
          </div>
        </td>
        <td className="xui-lines-td text-xs whitespace-nowrap" style={{ color: "var(--muted)" }}>
          {formatDateTime(l.createdAt)}
        </td>
        <td className="xui-lines-td xui-lines-td--actions">
          <LineRowActionsMenu
            line={l}
            onUpdated={onRefresh}
            open={openMenuId === l.id}
            onToggle={() => setOpenMenuId(openMenuId === l.id ? null : l.id)}
            onClose={() => setOpenMenuId(null)}
            portalEnabled={isMdUp}
          />
        </td>
      </>
    );
  }
  return (
    <div className="xui-lines-panel rounded-lg border" style={{ borderColor: "var(--border)", overflow: "visible" }}>
        <div className="xui-lines-header">
          <div className="flex items-center gap-2 text-white">
            <ShoppingCart size={20} className="opacity-90" />
            <h1 className="text-lg font-semibold">Manage Lines</h1>
          </div>
          <Link href={`${base}/lines/add?package=1`} className="xui-lines-header-btn xui-lines-header-btn--primary">
            <PackagePlus size={16} />
            Add Line (with Package)
          </Link>
        </div>

      <div className="xui-lines-toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="xui-lines-select"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          >
            <option value="">Bulk Actions</option>
            <option value="disable">Disable selected</option>
            <option value="delete">Delete selected</option>
          </select>
          <button type="button" className="xui-lines-toolbar-btn" onClick={() => void runBulk()} disabled={!bulk}>
            Apply
          </button>
          <button
            type="button"
            className="xui-lines-toolbar-btn xui-lines-toolbar-btn--export"
            onClick={() => {
              window.location.href = "/api/admin/lines/export?format=subscriptions";
            }}
          >
            <List size={14} />
            Export To File
          </button>
        </div>
        <label className="xui-lines-toggle">
          <RefreshCw size={14} className="opacity-70" />
          <span>Auto-refresh</span>
          <button
            type="button"
            role="switch"
            aria-checked={autoRefresh}
            className={`xui-lines-switch ${autoRefresh ? "xui-lines-switch--on" : ""}`}
            onClick={() => setAutoRefresh((v) => !v)}
          >
            <span className="xui-lines-switch-knob" />
          </button>
          <span className="text-xs font-medium">{autoRefresh ? "On" : "Off"}</span>
        </label>
        <div className="flex items-center gap-2 ml-auto flex-1 justify-end min-w-[200px] max-w-md">
          <div className="xui-lines-search-wrap flex-1">
            <Search size={15} className="xui-lines-search-icon" />
            <input
              type="search"
              autoComplete="off"
              placeholder="Search lines…"
              className="xui-lines-search-input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <button type="button" className="xui-lines-icon-btn" onClick={onRefresh} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button type="button" className="xui-lines-icon-btn" title="Filters">
            <Filter size={16} />
          </button>
          <button type="button" className="xui-lines-icon-btn" title="Columns">
            <List size={16} />
          </button>
        </div>
      </div>
      <div className="md:hidden divide-y" style={{ borderColor: "var(--border)" }}>
        {pageRows.map((l, idx) => {
          const exp = formatExpireXui(l.expiresAt);
          const notes = splitNotes(l.notes);
          return (
            <article key={l.id} className="panel-mobile-card p-4 space-y-2">
              <div className="flex justify-between gap-2">
                <div>
                  <Link href={`${base}/lines?edit=${l.id}`} className="xui-lines-username font-semibold">
                    {l.username}
                  </Link>
                  <CopyableCredential value={l.password} masked className="mt-1" />
                </div>
                <LineRowActionsMenu
                  line={l}
                  onUpdated={onRefresh}
                  open={openMenuId === l.id}
                  onToggle={() => setOpenMenuId(openMenuId === l.id ? null : l.id)}
                  onClose={() => setOpenMenuId(null)}
                  portalEnabled={!isMdUp}
                />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <XuiPill value={l.status === "BANNED" ? "YES" : "NO"} variant={l.status === "BANNED" ? "yes" : "no"} />
                {exp.kind === "unlimited" ? (
                  <XuiPill value="UNLIMITED" variant="unlimited" />
                ) : (
                  <span>{exp.text}</span>
                )}
              </div>
              <p className="text-xs">
                Conn {(l as { activeConnectionCount?: number }).activeConnectionCount ?? l._count?.liveConnections ?? 0}/{l.maxConnections} · {l.owner?.username ?? "admin"}
              </p>
              <LastWatchedCell
                streamName={l.lastWatchedStream?.name}
                ip={l.lastWatchedIp ?? l.activeConnection?.ip}
                watchedAt={l.lastWatchedAt}
              />
              <div className="flex gap-1">
                <NoteBtn label="Admin" hasNote={Boolean(notes.admin)} />
                <NoteBtn label="Reseller" hasNote={Boolean(notes.reseller)} />
              </div>
            </article>
          );
        })}      </div>

      <div className="hidden md:block overflow-x-auto overflow-y-visible">
        <table className="xui-lines-table w-full text-sm min-w-[1400px]">
          <thead>
            <tr>
              <th className="xui-lines-th xui-lines-td--check">
                <input
                  type="checkbox"
                  checked={pageRows.length > 0 && pageRows.every((l) => selected.has(l.id))}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th className="xui-lines-th">Sta</th>
              <SortHead label="Username" col="username" />
              <th className="xui-lines-th">Password</th>
              {panel === "admin" ? <SortHead label="Owner" col="owner" /> : null}
              <SortHead label="Expire" col="expiresAt" />
              <th className="xui-lines-th">Ban</th>
              <th className="xui-lines-th">Package</th>
              <th className="xui-lines-th">Trial</th>
              <th className="xui-lines-th">Conns</th>
              <th className="xui-lines-th">Conn Info</th>
              <th className="xui-lines-th">Last Watched</th>
              <th className="xui-lines-th">Notes</th>
              <th className="xui-lines-th">Created</th>
              <th className="xui-lines-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={panel === "admin" ? 15 : 14} className="px-4 py-10 text-center" style={{ color: "var(--muted)" }}>
                  No lines found
                </td>
              </tr>
            ) : (
              pageRows.map((l, idx) => (
                <tr key={l.id} className={idx % 2 === 0 ? "xui-lines-row--even" : "xui-lines-row--odd"}>
                  {renderRowCells(l)}
                </tr>
              ))
            )}
          </tbody>
        </table>      </div>

      {editLineId && (
        <div className="xui-modal-backdrop" onClick={closeEdit}>
          <div className="xui-modal-panel xui-line-edit-modal" onClick={(e) => e.stopPropagation()}>
            <LineEditForm
              lineId={editLineId}
              panel={panel}
              onClose={closeEdit}
              onSaved={() => {
                onRefresh();
                closeEdit();
              }}
            />
          </div>
        </div>
      )}

      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t text-sm"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.08)" }}
      >
        <p style={{ color: "var(--muted)" }}>
          Total: <strong className="text-[var(--fg)]">{lines.length}</strong> · Filtered:{" "}
          <strong className="text-[var(--fg)]">{total}</strong>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            Rows per page
            <select
              className="xui-lines-select py-1"
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={safePage <= 1}
            className="rounded px-3 py-1 border disabled:opacity-40 cursor-pointer"
            style={{ borderColor: "var(--border)" }}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="tabular-nums px-2">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            className="rounded px-3 py-1 border disabled:opacity-40 cursor-pointer"
            style={{ borderColor: "var(--border)" }}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>    </div>
  );
}
