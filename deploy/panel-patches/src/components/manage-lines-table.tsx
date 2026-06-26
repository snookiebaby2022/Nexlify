"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  ArrowUpDown,
  FileDown,
  FileUp,
  Lock,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  PackagePlus,
  Plus,
} from "lucide-react";
import { LineActions } from "@/components/line-actions";
import { LineRowActionsMenu } from "@/components/line-row-actions-menu";
import { CopyableCredential } from "@/components/copyable-credential";
import { formatDateTime } from "@/lib/format";

export type ManageLineRow = {
  id: string;
  username: string;
  password: string;
  status: string;
  maxConnections: number;
  expiresAt: string;
  createdAt: string;
  externalId?: string | null;
  lockToIp?: boolean;
  notes?: string | null;
  owner?: { id: string; username: string } | null;
  bouquets: { bouquet: { id: string; name: string } }[];
  _count?: { channelWatches?: number; liveConnections?: number };
};

const PAGE_SIZES = [10, 25, 50, 100];

function splitNotes(notes: string | null | undefined) {
  if (!notes?.trim()) return { admin: "", reseller: "" };
  const parts = notes.split("\n---\n");
  return { admin: parts[0]?.trim() ?? "", reseller: parts[1]?.trim() ?? "" };
}

function isUnlimited(expiresAt: string) {
  const exp = new Date(expiresAt).getTime();
  const years = (exp - Date.now()) / (86400000 * 365);
  return years > 8;
}

function isTrialLine(line: ManageLineRow) {
  const created = new Date(line.createdAt).getTime();
  const exp = new Date(line.expiresAt).getTime();
  const days = (exp - created) / 86400000;
  return days <= 2.5;
}

function expireLabel(expiresAt: string) {
  const exp = new Date(expiresAt);
  const now = new Date();
  if (isUnlimited(expiresAt)) return { kind: "unlimited" as const, text: "" };
  const text = formatDateTime(expiresAt);
  if (exp < now) {
    const days = Math.floor((now.getTime() - exp.getTime()) / 86400000);
    return { kind: "expired" as const, text: `${text} · ${days} day${days === 1 ? "" : "s"} ago` };
  }
  return { kind: "active" as const, text };
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
  const base = panel === "reseller" ? "/reseller" : "/admin";
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showInternal, setShowInternal] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const isMdUp = useMediaQuery("(min-width: 768px)");
  const [bulk, setBulk] = useState("");
  const [sortKey, setSortKey] = useState<"username" | "expiresAt" | "owner">("username");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = lines;
    if (showInternal) {
      list = list.filter((l) => !l.externalId);
    }
    if (q) {
      list = list.filter(
        (l) =>
          l.username.toLowerCase().includes(q) ||
          l.id.toLowerCase().includes(q) ||
          (l.owner?.username?.toLowerCase().includes(q) ?? false) ||
          (l.externalId?.toLowerCase().includes(q) ?? false) ||
          l.bouquets.some((b) => b.bouquet.name.toLowerCase().includes(q))
      );
    }
    list = [...list].sort((a, b) => {
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
  }, [lines, search, showInternal, sortKey, sortDir]);

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
    const exp = expireLabel(l.expiresAt);
    const notes = splitNotes(l.notes);
    const pkg = l.bouquets[0]?.bouquet.name ?? "—";
    const activeConn = l._count?.liveConnections ?? 0;
    const isActive = l.status === "ACTIVE" && new Date(l.expiresAt) > new Date();

    return (
      <>
        <td className="xui-lines-td xui-lines-td--check">
          <input
            type="checkbox"
            checked={selected.has(l.id)}
            onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(l.id);
              else next.delete(l.id);
              setSelected(next);
            }}
          />
        </td>
        <td className="xui-lines-td xui-lines-td--id font-mono text-xs">{l.id}</td>
        <td className="xui-lines-td text-center">
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              title={l.status}
              style={{ background: isActive ? "#22c55e" : l.status === "BANNED" ? "#ef4444" : "#9ca3af" }}
            />
            {l.lockToIp && <Lock size={12} className="opacity-50" />}
          </span>
        </td>
        <td className="xui-lines-td">
          <div className="flex flex-col gap-1 min-w-0">
            <Link href={`${base}/lines?edit=${l.id}`} className="xui-lines-username">
              {l.username}
            </Link>
            <CopyableCredential value={l.password} masked className="text-[11px]" />
          </div>
        </td>
        {panel === "admin" ? (
          <td className="xui-lines-td" style={{ color: "var(--muted)" }}>
            {l.owner?.username ?? "admin"}
          </td>
        ) : null}
        <td className="xui-lines-td whitespace-nowrap">
          {exp.kind === "unlimited" ? (
            <XuiPill value="UNLIMITED" variant="unlimited" />
          ) : exp.kind === "expired" ? (
            <span className="text-red-500 text-xs">{exp.text}</span>
          ) : (
            <span className="text-xs">{exp.text}</span>
          )}
        </td>
        <td className="xui-lines-td">
          <XuiPill value={l.status === "BANNED" ? "YES" : "NO"} variant={l.status === "BANNED" ? "yes" : "no"} />
        </td>
        <td className="xui-lines-td text-xs">{pkg}</td>
        <td className="xui-lines-td">
          <XuiPill value={isTrialLine(l) ? "YES" : "NO"} variant={isTrialLine(l) ? "yes" : "no"} />
        </td>
        <td className="xui-lines-td">
          <XuiPill value="NO" variant="no" />
        </td>
        <td className="xui-lines-td tabular-nums text-xs text-center">
          {activeConn}/{l.maxConnections}
        </td>
        <td className="xui-lines-td text-xs" style={{ color: "var(--muted)" }}>
          —
        </td>
        <td className="xui-lines-td">
          <div className="flex flex-col gap-0.5">
            {panel === "admin" && <NoteBtn label="Admin" hasNote={Boolean(notes.admin)} />}
            <NoteBtn label={panel === "reseller" ? "Note" : "Reseller"} hasNote={Boolean(notes.reseller)} />
          </div>
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
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/lines/add`} className="xui-lines-header-btn xui-lines-header-btn--outline">
            <Plus size={16} />
            Add Line
          </Link>
          <Link href={`${base}/lines/add?package=1`} className="xui-lines-header-btn xui-lines-header-btn--primary">
            <PackagePlus size={16} />
            Add Line (with Package)
          </Link>
        </div>
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
            className="xui-lines-toolbar-btn"
            onClick={() => {
              window.location.href = "/api/admin/lines/export?format=subscriptions";
            }}
          >
            <FileDown size={14} />
            Export To File
          </button>
          <button
            type="button"
            className="xui-lines-toolbar-btn"
            onClick={() => alert("Import: use Mass edit or API import when configured.")}
          >
            <FileUp size={14} />
            Import File
          </button>
        </div>
        <label className="xui-lines-toggle">
          <span>Show internal</span>
          <button
            type="button"
            role="switch"
            aria-checked={showInternal}
            className={`xui-lines-switch ${showInternal ? "xui-lines-switch--on" : ""}`}
            onClick={() => setShowInternal((v) => !v)}
          >
            <span className="xui-lines-switch-knob" />
          </button>
          <span className="text-xs font-medium">{showInternal ? "On" : "Off"}</span>
        </label>
        <div className="flex items-center gap-1 ml-auto">
          <button type="button" className="xui-lines-icon-btn" onClick={onRefresh} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            className="xui-lines-icon-btn"
            onClick={() => setSearchOpen((o) => !o)}
            title="Search"
          >
            <Search size={16} />
          </button>
          <button type="button" className="xui-lines-icon-btn" title="Filters">
            <Settings size={16} />
          </button>
        </div>
      </div>

      {(searchOpen || search) && (
        <div className="px-4 py-2 border-b flex flex-wrap items-center gap-3 text-sm" style={{ borderColor: "var(--border)" }}>
          <label className="flex items-center gap-2 flex-1 min-w-[200px]">
            <span style={{ color: "var(--muted)" }}>Search</span>
            <input
              type="search"
              className="flex-1 rounded border px-3 py-1.5 text-sm bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="flex items-center gap-2" style={{ color: "var(--muted)" }}>
            Show
            <select
              className="panel-select rounded border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)", background: "#fff", color: "#111" }}
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
            entries
          </label>
        </div>
      )}

      <div className="md:hidden divide-y" style={{ borderColor: "var(--border)" }}>
        {pageRows.map((l) => {
          const exp = expireLabel(l.expiresAt);
          const notes = splitNotes(l.notes);
          return (
            <article key={l.id} className="panel-mobile-card p-4 space-y-2">
              <div className="flex justify-between gap-2">
                <Link href={`${base}/lines?edit=${l.id}`} className="xui-lines-username font-semibold">
                  {l.username}
                </Link>
                <CopyableCredential value={l.password} masked className="mt-1" />
                <LineRowActionsMenu
                  line={l}
                  onUpdated={onRefresh}
                  open={openMenuId === l.id}
                  onToggle={() => setOpenMenuId(openMenuId === l.id ? null : l.id)}
                  onClose={() => setOpenMenuId(null)}
                  portalEnabled={!isMdUp}
                />
              </div>
              <p className="text-xs font-mono truncate" style={{ color: "var(--muted)" }}>
                {l.id}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <XuiPill value={l.status === "BANNED" ? "YES" : "NO"} variant={l.status === "BANNED" ? "yes" : "no"} />
                {exp.kind === "unlimited" ? (
                  <XuiPill value="UNLIMITED" variant="unlimited" />
                ) : (
                  <span>{exp.text}</span>
                )}
              </div>
              <p className="text-xs">
                Conn {(l._count?.liveConnections ?? 0)}/{l.maxConnections} · {l.owner?.username ?? "admin"}
              </p>
              <div className="flex gap-1">
                <NoteBtn label="Admin" hasNote={Boolean(notes.admin)} />
                <NoteBtn label="Reseller" hasNote={Boolean(notes.reseller)} />
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden md:block overflow-x-auto overflow-y-visible">
        <table className="xui-lines-table w-full text-sm min-w-[1200px]">
          <thead>
            <tr>
              <th className="xui-lines-th xui-lines-td--check">
                <input
                  type="checkbox"
                  checked={pageRows.length > 0 && pageRows.every((l) => selected.has(l.id))}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th className="xui-lines-th">ID</th>
              <th className="xui-lines-th">Sta</th>
              <SortHead label="Username" col="username" />
              {panel === "admin" ? <SortHead label="Owner" col="owner" /> : null}
              <SortHead label="Expire" col="expiresAt" />
              <th className="xui-lines-th">Ban</th>
              <th className="xui-lines-th">Package</th>
              <th className="xui-lines-th">Trial</th>
              <th className="xui-lines-th">Restreamer</th>
              <th className="xui-lines-th">Conr</th>
              <th className="xui-lines-th">Conn Info</th>
              <th className="xui-lines-th">Notes</th>
              <th className="xui-lines-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={panel === "admin" ? 14 : 13} className="px-4 py-10 text-center" style={{ color: "var(--muted)" }}>
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
        </table>
      </div>

      {editLineId && pageRows.some((l) => l.id === editLineId) && (
        <div className="border-t p-4" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.12)" }}>
          <p className="text-sm font-medium mb-2">Edit line</p>
          {(() => {
            const line = lines.find((l) => l.id === editLineId);
            if (!line) return null;
            return (
              <LineActions
                line={line}
                bouquets={bouquets}
                onUpdated={onRefresh}
                startEditing
                showEditButton={false}
              />
            );
          })()}
        </div>
      )}

      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t text-sm"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.08)" }}
      >
        <p style={{ color: "var(--muted)" }}>
          {total === 0
            ? "No entries"
            : `Showing ${start + 1} to ${Math.min(start + pageSize, total)} of ${total} entries`}
        </p>
        <div className="flex items-center gap-2">
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
      </div>
    </div>
  );
}
