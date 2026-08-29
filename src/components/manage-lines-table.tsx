"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  ArrowUpDown,
  ChevronRight,
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
import { linesApiRoot } from "@/lib/panel-api";
import { ConnInfoCell, LastWatchedCell } from "@/components/line-last-watched-cell";
import { formatDateTime, formatExpireXui } from "@/lib/format";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import {
  ColumnPickerList,
  ToolbarDropdown,
  useStoredColumnVisibility,
} from "@/components/table-toolbar-menus";

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

type LineSortKey = "username" | "expiresAt" | "owner" | "createdAt";
type StatusFilter = "all" | "ACTIVE" | "DISABLED" | "BANNED";
type TrialFilter = "all" | "yes" | "no";

const LINE_COLUMN_DEFAULTS: Record<string, boolean> = {
  sta: true,
  username: true,
  password: true,
  owner: true,
  expire: true,
  ban: true,
  bouquet: true,
  trial: true,
  conns: true,
  connInfo: true,
  lastWatched: true,
  notes: true,
  created: true,
  actions: true,
};

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
  serverTotal,
  serverPage,
  serverPageSize,
  serverSearch,
  onServerPageChange,
  onServerPageSizeChange,
  onServerSearchChange,
  serverSort,
  serverSortDir,
  serverStatusFilter,
  serverTrialFilter,
  onServerSortChange,
  onServerStatusFilterChange,
  onServerTrialFilterChange,
  loading = false,
}: {
  lines: ManageLineRow[];
  bouquets: { id: string; name: string }[];
  editLineId?: string | null;
  onRefresh: () => void;
  panel?: "admin" | "reseller";
  loading?: boolean;
  /** When set, pagination/search are server-driven (avoid loading thousands of rows). */
  serverTotal?: number;
  serverPage?: number;
  serverPageSize?: number;
  serverSearch?: string;
  serverSort?: LineSortKey;
  serverSortDir?: "asc" | "desc";
  serverStatusFilter?: StatusFilter;
  serverTrialFilter?: TrialFilter;
  onServerPageChange?: (page: number) => void;
  onServerPageSizeChange?: (size: number) => void;
  onServerSearchChange?: (q: string) => void;
  onServerSortChange?: (key: LineSortKey, dir: "asc" | "desc") => void;
  onServerStatusFilterChange?: (value: StatusFilter) => void;
  onServerTrialFilterChange?: (value: TrialFilter) => void;
}) {
  const router = useRouter();
  const base = panel === "reseller" ? "/reseller" : "/admin";
  const linesApi = linesApiRoot(panel);
  const serverMode = typeof serverTotal === "number" && !!onServerPageChange;
  const [search, setSearch] = useState(serverSearch ?? "");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [pageSize, setPageSize] = useState(serverPageSize ?? 50);
  const [page, setPage] = useState(serverPage ?? 1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const isMdUp = useMediaQuery("(min-width: 768px)");
  const [bulk, setBulk] = useState("");
  const [sortKey, setSortKey] = useState<LineSortKey>(serverSort ?? "createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(serverSortDir ?? "desc");
  const [createdBanner, setCreatedBanner] = useState("");
  const [mobileToolbarOpen, setMobileToolbarOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(serverStatusFilter ?? "all");
  const [trialFilter, setTrialFilter] = useState<TrialFilter>(serverTrialFilter ?? "all");
  const columns = useStoredColumnVisibility(`nexlify.lines.columns.${panel}`, LINE_COLUMN_DEFAULTS);
  const lineColumnOptions = [
    { id: "sta", label: "Status" },
    { id: "username", label: "Username", locked: true },
    { id: "password", label: "Password" },
    ...(panel === "admin" ? [{ id: "owner", label: "Owner" }] : []),
    { id: "expire", label: "Expire" },
    { id: "ban", label: "Ban" },
    { id: "bouquet", label: "Bouquet" },
    { id: "trial", label: "Trial" },
    { id: "conns", label: "Conns" },
    { id: "connInfo", label: "Conn Info" },
    { id: "lastWatched", label: "Last Watched" },
    { id: "notes", label: "Notes" },
    { id: "created", label: "Created" },
    { id: "actions", label: "Actions", locked: true },
  ];

  useEffect(() => {
    if (typeof serverSearch === "string") setSearch(serverSearch);
  }, [serverSearch]);
  useEffect(() => {
    if (typeof serverPage === "number") setPage(serverPage);
  }, [serverPage]);
  useEffect(() => {
    if (typeof serverPageSize === "number") setPageSize(serverPageSize);
  }, [serverPageSize]);
  useEffect(() => {
    if (serverSort) setSortKey(serverSort);
  }, [serverSort]);
  useEffect(() => {
    if (serverSortDir) setSortDir(serverSortDir);
  }, [serverSortDir]);
  useEffect(() => {
    if (serverStatusFilter) setStatusFilter(serverStatusFilter);
  }, [serverStatusFilter]);
  useEffect(() => {
    if (serverTrialFilter) setTrialFilter(serverTrialFilter);
  }, [serverTrialFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const created = sp.get("created")?.trim();
    const q = sp.get("q")?.trim();
    if (created) {
      setSearch("");
      onServerSearchChange?.("");
      onServerPageChange?.(1);
      setCreatedBanner(`Line “${created}” created successfully.`);
      if (serverMode && onServerSortChange) onServerSortChange("createdAt", "desc");
      else {
        setSortKey("createdAt");
        setSortDir("desc");
      }
      router.replace(`${base}/lines`, { scroll: false });
      onRefresh();
    } else if (q) {
      setSearch(q);
      onServerSearchChange?.(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot URL bootstrap
  }, []);

  // Debounce server search
  useEffect(() => {
    if (!serverMode || !onServerSearchChange) return;
    const t = setTimeout(() => {
      if (search !== (serverSearch ?? "")) onServerSearchChange(search);
    }, 300);
    return () => clearTimeout(t);
  }, [search, serverMode, onServerSearchChange, serverSearch]);

  function closeEdit() {
    router.push(`${base}/lines`);
  }

  const filtered = useMemo(() => {
    if (serverMode) return lines;
    let list = [...lines];
      const q = search.trim().toLowerCase();
      if (q) {
        list = list.filter(
          (l) =>
            (l.username ?? "").toLowerCase().includes(q) ||
            (l.password ?? "").toLowerCase().includes(q) ||
            (l.id ?? "").toLowerCase().includes(q) ||
            (l.owner?.username?.toLowerCase().includes(q) ?? false) ||
            (l.externalId?.toLowerCase().includes(q) ?? false) ||
            (l.lastWatchedStream?.name?.toLowerCase().includes(q) ?? false) ||
            (l.lastWatchedIp?.toLowerCase().includes(q) ?? false) ||
            (l.bouquets ?? []).some((b) => b.bouquet?.name?.toLowerCase().includes(q))
        );
      }
    if (statusFilter !== "all") {
      list = list.filter((l) => l.status === statusFilter);
    }
    if (trialFilter === "yes") list = list.filter((l) => isTrialLine(l));
    if (trialFilter === "no") list = list.filter((l) => !isTrialLine(l));
    list.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "username") {
        av = a.username.toLowerCase();
        bv = b.username.toLowerCase();
      } else if (sortKey === "owner") {
        av = a.owner?.username?.toLowerCase() ?? "";
        bv = b.owner?.username?.toLowerCase() ?? "";
      } else if (sortKey === "createdAt") {
        av = new Date(a.createdAt).getTime();
        bv = new Date(b.createdAt).getTime();
      } else {
        av = new Date(a.expiresAt).getTime();
        bv = new Date(b.expiresAt).getTime();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [lines, search, sortKey, sortDir, serverMode, statusFilter, trialFilter]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => onRefresh(), 30_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, onRefresh]);
  const total = serverMode ? serverTotal! : filtered.length;
  const effectivePageSize = serverMode ? (serverPageSize ?? pageSize) : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));
  const safePage = Math.min(serverMode ? (serverPage ?? page) : page, totalPages);
  const pageRows = serverMode
    ? filtered
    : filtered.slice((safePage - 1) * effectivePageSize, (safePage - 1) * effectivePageSize + effectivePageSize);

  function toggleSort(key: LineSortKey) {
    const nextDir =
      sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : key === "createdAt" || key === "expiresAt" ? "desc" : "asc";
    if (serverMode && onServerSortChange) {
      onServerSortChange(key, nextDir);
      onServerPageChange?.(1);
      return;
    }
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(nextDir);
    }
  }

  function applyStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
    if (serverMode && onServerStatusFilterChange) onServerStatusFilterChange(value);
    else setPage(1);
  }

  function applyTrialFilter(value: TrialFilter) {
    setTrialFilter(value);
    if (serverMode && onServerTrialFilterChange) onServerTrialFilterChange(value);
    else setPage(1);
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
        await fetch(`${linesApi}/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "DISABLED" }),
        });
      }
    } else if (bulk === "delete") {
      if (!confirm(`Delete ${ids.length} line(s)?`)) return;
      for (const id of ids) {
        await fetch(`${linesApi}/${id}`, { method: "DELETE" });
      }
    }
    setBulk("");
    setSelected(new Set());
    onRefresh();
  }

  const SortHead = ({ label, col }: { label: string; col: LineSortKey }) => (
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
    const pkg =
      (l.bouquets ?? [])
        .map((b) => b.bouquet?.name)
        .filter(Boolean)
        .join(", ") || "—";
    const activeConn =
      (l as { activeConnectionCount?: number }).activeConnectionCount ?? 0;
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
        {columns.show("sta") ? (
          <td className="xui-lines-td text-center">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              title={isActive ? "Active" : l.status}
              style={{ background: isActive ? "#22c55e" : l.status === "BANNED" ? "#ef4444" : "#9ca3af" }}
            />
          </td>
        ) : null}
        {columns.show("username") ? (
          <td className="xui-lines-td min-w-[7rem]">
            <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
              <Link href={`${base}/lines?edit=${l.id}`} className="xui-lines-username truncate">
                {l.username}
              </Link>
              <CopyableCredential value={l.username} className="shrink-0 [&>code]:sr-only" />
            </span>
          </td>
        ) : null}
        {columns.show("password") ? (
          <td className="xui-lines-td min-w-[6rem]">
            <CopyableCredential value={l.password} masked />
          </td>
        ) : null}
        {panel === "admin" && columns.show("owner") ? (
          <td className="xui-lines-td text-xs" style={{ color: "var(--muted)" }}>
            {l.owner?.username ?? "admin"}
          </td>
        ) : null}
        {columns.show("expire") ? (
          <td className="xui-lines-td whitespace-nowrap text-xs">
            {exp.kind === "unlimited" ? (
              <XuiPill value="UNLIMITED" variant="unlimited" />
            ) : exp.kind === "expired" ? (
              <span className="text-red-400">{exp.text}</span>
            ) : (
              <span>{exp.text}</span>
            )}
          </td>
        ) : null}
        {columns.show("ban") ? (
          <td className="xui-lines-td">
            <XuiPill value={l.status === "BANNED" ? "YES" : "NO"} variant={l.status === "BANNED" ? "yes" : "no"} />
          </td>
        ) : null}
        {columns.show("bouquet") ? (
          <td className="xui-lines-td text-xs max-w-[8rem] truncate" title={pkg}>
            {pkg}
          </td>
        ) : null}
        {columns.show("trial") ? (
          <td className="xui-lines-td">
            <XuiPill value={isTrialLine(l) ? "YES" : "NO"} variant={isTrialLine(l) ? "yes" : "no"} />
          </td>
        ) : null}
        {columns.show("conns") ? (
          <td className="xui-lines-td tabular-nums text-xs text-center whitespace-nowrap">
            {activeConn}/{Math.max(1, l.maxConnections)}
          </td>
        ) : null}
        {columns.show("connInfo") ? (
          <td className="xui-lines-td min-w-[9rem]">
            <ConnInfoCell activeConnection={l.activeConnection} />
          </td>
        ) : null}
        {columns.show("lastWatched") ? (
          <td className="xui-lines-td min-w-[11rem]">
            <LastWatchedCell
              streamName={l.lastWatchedStream?.name}
              ip={l.lastWatchedIp ?? l.activeConnection?.ip}
              watchedAt={l.lastWatchedAt}
            />
          </td>
        ) : null}
        {columns.show("notes") ? (
          <td className="xui-lines-td">
            <div className="flex flex-col gap-0.5">
              {panel === "admin" && <NoteBtn label="Admin" hasNote={Boolean(notes.admin)} />}
              <NoteBtn label={panel === "reseller" ? "Note" : "Reseller"} hasNote={Boolean(notes.reseller)} />
            </div>
          </td>
        ) : null}
        {columns.show("created") ? (
          <td className="xui-lines-td text-xs whitespace-nowrap" style={{ color: "var(--muted)" }}>
            {formatDateTime(l.createdAt)}
          </td>
        ) : null}
        {columns.show("actions") ? (
          <td className="xui-lines-td xui-lines-td--actions">
            <LineRowActionsMenu
              line={l}
              panel={panel}
              onUpdated={onRefresh}
              open={openMenuId === l.id}
              onToggle={() => setOpenMenuId(openMenuId === l.id ? null : l.id)}
              onClose={() => setOpenMenuId(null)}
              portalEnabled={isMdUp}
            />
          </td>
        ) : null}
      </>
    );
  }
  return (
    <div className="xui-lines-panel rounded-lg border" style={{ borderColor: "var(--border)", overflow: "visible" }}>
        <div className="xui-lines-header">
          <div className="flex items-center gap-2 text-white">
            <ShoppingCart size={20} className="opacity-90" />
            <h1 className="text-lg font-semibold">Manage Lines</h1>
            <span className="text-xs text-white/70 font-normal tabular-nums">
              {lines.length.toLocaleString()} loaded · newest first
            </span>
          </div>
          <Link href={`${base}/lines/add`} className="xui-lines-header-btn xui-lines-header-btn--primary">
            <PackagePlus size={16} />
            Add Line
          </Link>
        </div>

      {createdBanner ? (
        <div
          className="mx-3 mt-3 rounded-md border px-3 py-2 text-sm flex items-center justify-between gap-2"
          style={{ borderColor: "rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.1)" }}
        >
          <span>{createdBanner}</span>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => {
              setCreatedBanner("");
              setSearch("");
              router.replace(`${base}/lines`);
            }}
          >
            Clear
          </button>
        </div>
      ) : null}

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
          {panel === "admin" && (
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
          )}
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
        <button
          type="button"
          className="panel-mobile-toolbar-trigger md:hidden"
          onClick={() => setMobileToolbarOpen(true)}
        >
          <Filter size={16} />
          Search & filters
        </button>
        <MobileFilterSheet
          open={mobileToolbarOpen}
          onClose={() => setMobileToolbarOpen(false)}
          title="Search lines"
        >
          <label>
            Search
            <input
              type="search"
              autoComplete="off"
              placeholder="Search lines…"
              className="xui-lines-search-input w-full"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="mt-3">
            Status
            <select
              className="xui-lines-select w-full"
              value={statusFilter}
              onChange={(e) => applyStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All</option>
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
              <option value="BANNED">Banned</option>
            </select>
          </label>
          <label className="mt-3">
            Trial
            <select
              className="xui-lines-select w-full"
              value={trialFilter}
              onChange={(e) => applyTrialFilter(e.target.value as TrialFilter)}
            >
              <option value="all">All</option>
              <option value="yes">Trial</option>
              <option value="no">Paid</option>
            </select>
          </label>
          <label className="mt-3">
            Show entries
            <select
              className="xui-lines-select w-full"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
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
          <div className="panel-mobile-sheet-actions">
            <button type="button" className="xui-lines-toolbar-btn" onClick={onRefresh}>
              <RefreshCw size={16} />
              Refresh list
            </button>
            <button type="button" className="btn-positive" onClick={() => setMobileToolbarOpen(false)}>
              Done
            </button>
          </div>
        </MobileFilterSheet>
        <div className="xui-lines-toolbar--desktop-search flex items-center gap-2 ml-auto flex-1 justify-end min-w-[200px] max-w-md">
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
          <button
            type="button"
            className={`xui-lines-icon-btn ${filtersOpen ? "xui-lines-icon-btn--active" : ""}`}
            title="Filters"
            aria-pressed={filtersOpen}
            onClick={() => {
              setFiltersOpen((o) => !o);
              setColumnsOpen(false);
            }}
          >
            <Filter size={16} />
          </button>
          <ToolbarDropdown
            open={columnsOpen}
            onClose={() => setColumnsOpen(false)}
            trigger={
              <button
                type="button"
                className={`xui-lines-icon-btn ${columnsOpen ? "xui-lines-icon-btn--active" : ""}`}
                title="Columns"
                aria-pressed={columnsOpen}
                onClick={() => {
                  setColumnsOpen((o) => !o);
                  setFiltersOpen(false);
                }}
              >
                <List size={16} />
              </button>
            }
          >
            <ColumnPickerList columns={lineColumnOptions} show={columns.show} onToggle={columns.toggle} />
          </ToolbarDropdown>
        </div>
      </div>
      {filtersOpen ? (
        <div className="xui-lines-extra-filters">
          <label className="flex items-center gap-2">
            <span style={{ color: "var(--muted)" }}>Status</span>
            <select
              className="xui-lines-select"
              value={statusFilter}
              onChange={(e) => {
                applyStatusFilter(e.target.value as StatusFilter);
                setPage(1);
              }}
            >
              <option value="all">All</option>
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
              <option value="BANNED">Banned</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span style={{ color: "var(--muted)" }}>Trial</span>
            <select
              className="xui-lines-select"
              value={trialFilter}
              onChange={(e) => {
                applyTrialFilter(e.target.value as TrialFilter);
                setPage(1);
              }}
            >
              <option value="all">All</option>
              <option value="yes">Trial</option>
              <option value="no">Paid</option>
            </select>
          </label>
        </div>
      ) : null}
      <div className="md:hidden panel-mobile-activity-list py-1">
        {pageRows.map((l) => {
          const exp = formatExpireXui(l.expiresAt);
          return (
            <article key={l.id} className="panel-mobile-activity-card">
              <div className="panel-mobile-activity-card-body min-w-0">
                <Link href={`${base}/lines?edit=${l.id}`} className="panel-mobile-activity-card-title hover:underline">
                  {l.username}
                </Link>
                <p className="panel-mobile-activity-card-meta">
                  <span className={`panel-mobile-status-badge ${l.status === "BANNED" ? "panel-mobile-status-badge--danger" : "panel-mobile-status-badge--active"}`}>
                    {l.status === "BANNED" ? "Banned" : "Active"}
                  </span>
                  {" · "}
                  {exp.kind === "unlimited" ? "Unlimited" : exp.text}
                </p>
              </div>
              <Link href={`${base}/lines?edit=${l.id}`} className="panel-mobile-activity-manage">
                Manage
                <ChevronRight size={16} />
              </Link>
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
              {columns.show("sta") ? <th className="xui-lines-th">Sta</th> : null}
              {columns.show("username") ? <SortHead label="Username" col="username" /> : null}
              {columns.show("password") ? <th className="xui-lines-th">Password</th> : null}
              {panel === "admin" && columns.show("owner") ? <SortHead label="Owner" col="owner" /> : null}
              {columns.show("expire") ? <SortHead label="Expire" col="expiresAt" /> : null}
              {columns.show("ban") ? <th className="xui-lines-th">Ban</th> : null}
              {columns.show("bouquet") ? (
                <th className="xui-lines-th" title="Assigned bouquet(s)">
                  Bouquet
                </th>
              ) : null}
              {columns.show("trial") ? <th className="xui-lines-th">Trial</th> : null}
              {columns.show("conns") ? <th className="xui-lines-th">Conns</th> : null}
              {columns.show("connInfo") ? <th className="xui-lines-th">Conn Info</th> : null}
              {columns.show("lastWatched") ? <th className="xui-lines-th">Last Watched</th> : null}
              {columns.show("notes") ? <th className="xui-lines-th">Notes</th> : null}
              {columns.show("created") ? <SortHead label="Created" col="createdAt" /> : null}
              {columns.show("actions") ? <th className="xui-lines-th">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: Math.min(pageSize, 8) }).map((_, idx) => (
                <tr key={`sk-${idx}`} className={idx % 2 === 0 ? "xui-lines-row--even" : "xui-lines-row--odd"}>
                  <td colSpan={1 + lineColumnOptions.filter((c) => columns.show(c.id)).length} className="px-4 py-3">
                    <div
                      className="h-4 rounded animate-pulse"
                      style={{ background: "var(--border)", width: `${60 + (idx % 3) * 12}%` }}
                    />
                  </td>
                </tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={1 + lineColumnOptions.filter((c) => columns.show(c.id)).length}
                  className="px-4 py-10 text-center"
                  style={{ color: "var(--muted)" }}
                >
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
          Total: <strong className="text-[var(--fg)]">{total.toLocaleString()}</strong>
          {!serverMode ? (
            <>
              {" "}
              · Filtered: <strong className="text-[var(--fg)]">{filtered.length.toLocaleString()}</strong>
            </>
          ) : (
            <>
              {" "}
              · This page: <strong className="text-[var(--fg)]">{pageRows.length.toLocaleString()}</strong>
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            Show entries
            <select
              className="xui-lines-select py-1"
              value={effectivePageSize}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (serverMode && onServerPageSizeChange) onServerPageSizeChange(n);
                else {
                  setPageSize(n);
                  setPage(1);
                }
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
            onClick={() => {
              const next = Math.max(1, safePage - 1);
              if (serverMode && onServerPageChange) onServerPageChange(next);
              else setPage(next);
            }}
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
            onClick={() => {
              const next = Math.min(totalPages, safePage + 1);
              if (serverMode && onServerPageChange) onServerPageChange(next);
              else setPage(next);
            }}
          >
            Next
          </button>
        </div>
      </div>    </div>
  );
}
