"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FilterX,
  LayoutList,
  PackagePlus,
  RefreshCw,
  Search,
  ShoppingCart,
} from "lucide-react";
import { CopyableCredential } from "@/components/copyable-credential";
import type { ManageLineRow } from "@/components/manage-lines-table";
import {
  formatMassEditExpire,
  type MassEditPatch,
  type TextFieldState,
  type TriState,
} from "@/lib/lines-mass-edit";
import { AccessOutputCheckboxes } from "@/components/access-output-checkboxes";
import {
  DEFAULT_ALLOWED_OUTPUT,
  defaultAccessOutputSelection,
  serializeAccessOutput,
  type AccessOutputId,
} from "@/lib/line-access-output";
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from "@/lib/list-page-sizes";

function XuiPill({ value, variant }: { value: string; variant: "yes" | "no" }) {
  return <span className={`xui-pill xui-pill--${variant}`}>{value}</span>;
}

function MassEditTriStateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TriState;
  onChange: (v: TriState) => void;
}) {
  return (
    <fieldset className="xui-mass-field">
      <legend className="xui-mass-field-label">{label}</legend>
      <div className="xui-mass-tristate">
        {(["unchanged", "yes", "no"] as const).map((opt) => (
          <label key={opt} className="xui-mass-radio">
            <input
              type="radio"
              name={label}
              checked={value === opt}
              onChange={() => onChange(opt)}
            />
            <span>{opt === "unchanged" ? "Do Not Change" : opt === "yes" ? "Yes" : "No"}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MassEditTextField({
  label,
  value,
  onChange,
  multiline,
  placeholder,
}: {
  label: string;
  value: TextFieldState;
  onChange: (v: TextFieldState) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const unchanged = value.unchanged;
  return (
    <div className="xui-mass-field">
      <div className="xui-mass-field-label">{label}</div>
      <label className="xui-mass-checkbox">
        <input
          type="checkbox"
          checked={unchanged}
          onChange={(e) => onChange(e.target.checked ? { unchanged: true } : { unchanged: false, value: "" })}
        />
        <span>Do Not Change</span>
      </label>
      {!unchanged &&
        (multiline ? (
          <textarea
            className="xui-mass-input"
            rows={3}
            placeholder={placeholder}
            value={value.value}
            onChange={(e) => onChange({ unchanged: false, value: e.target.value })}
          />
        ) : (
          <input
            className="xui-mass-input"
            type="text"
            placeholder={placeholder}
            value={value.value}
            onChange={(e) => onChange({ unchanged: false, value: e.target.value })}
          />
        ))}
    </div>
  );
}

const DEFAULT_FORM = {
  password: { unchanged: true } as TextFieldState,
  resellerNotes: { unchanged: true } as TextFieldState,
  enabled: "unchanged" as TriState,
  canWatchAdult: "unchanged" as TriState,
  allowedCountries: { unchanged: true } as TextFieldState,
  allowedIps: { unchanged: true } as TextFieldState,
  allowedUserAgents: { unchanged: true } as TextFieldState,
  disallowedUserAgents: { unchanged: true } as TextFieldState,
  blockedIsps: { unchanged: true } as TextFieldState,
  allowedOutputs: { unchanged: true } as TextFieldState,
  accessOutputsSelected: defaultAccessOutputSelection() as Set<AccessOutputId>,
  accessOutputsTouched: false,
  lockToIp: "unchanged" as TriState,
};

export function LinesMassEditView({ panel = "admin" }: { panel?: "admin" | "reseller" }) {
  const base = panel === "reseller" ? "/reseller" : "/admin";
  const [lines, setLines] = useState<ManageLineRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_LIST_PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [sort, setSort] = useState<"username" | "expiresAt" | "owner" | "createdAt" | "status">("expiresAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function load() {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sort,
      sortDir,
    });
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/admin/lines?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setLines(d.lines ?? []);
        setTotal(d.pagination?.total ?? d.lines?.length ?? 0);
      });
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch((prev) => {
        if (prev === searchInput) return prev;
        setPage(1);
        return searchInput;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on page/size/search/sort
  }, [page, pageSize, search, sort, sortDir]);

  function toggleSort(key: typeof sort) {
    if (sort === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setSortDir(key === "expiresAt" || key === "createdAt" ? "asc" : "asc");
      setPage(1);
    }
  }

  const filtered = lines;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(filtered.map((l) => l.id)) : new Set());
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function buildPatch(): MassEditPatch {
    const patch: MassEditPatch = {};
    if (!form.password.unchanged) patch.password = form.password;
    if (!form.resellerNotes.unchanged) patch.resellerNotes = form.resellerNotes;
    if (form.enabled !== "unchanged") patch.enabled = form.enabled;
    if (form.canWatchAdult !== "unchanged") patch.canWatchAdult = form.canWatchAdult;
    if (!form.allowedCountries.unchanged) patch.allowedCountries = form.allowedCountries;
    if (!form.allowedIps.unchanged) patch.allowedIps = form.allowedIps;
    if (!form.allowedUserAgents.unchanged) patch.allowedUserAgents = form.allowedUserAgents;
    if (!form.disallowedUserAgents.unchanged) patch.disallowedUserAgents = form.disallowedUserAgents;
    if (!form.blockedIsps.unchanged) patch.blockedIsps = form.blockedIsps;
    if (form.accessOutputsTouched) {
      patch.allowedOutputs = {
        unchanged: false,
        value: serializeAccessOutput(form.accessOutputsSelected),
      };
    } else if (!form.allowedOutputs.unchanged) {
      patch.allowedOutputs = form.allowedOutputs;
    }
    if (form.lockToIp !== "unchanged") patch.lockToIp = form.lockToIp;
    return patch;
  }

  async function apply() {
    if (!selected.size) {
      setMsg("Select at least one line");
      return;
    }
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      setMsg("Change at least one field in the Mass Edit Form");
      return;
    }

    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/lines/mass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lineIds: Array.from(selected),
        action: "mass_edit",
        patch,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "Update failed");
      return;
    }
    setMsg(`Updated ${data.affected} line${data.affected === 1 ? "" : "s"}`);
    setSelected(new Set());
    load();
  }

  const colSpan = panel === "admin" ? 7 : 6;

  return (
    <div className="xui-lines-panel xui-mass-edit-panel rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
      <div className="xui-lines-header">
        <div className="flex items-center gap-2 text-white">
          <ShoppingCart size={20} className="opacity-90" />
          <h1 className="text-lg font-semibold">Mass Edit Lines</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/lines/add`} className="xui-lines-header-btn xui-lines-header-btn--outline">
            <PackagePlus size={16} />
            Add Line
          </Link>
          <Link href={`${base}/lines`} className="xui-lines-header-btn xui-lines-header-btn--outline">
            <LayoutList size={16} />
            Manage Lines
          </Link>
        </div>
      </div>

      <div className="xui-mass-edit-layout">
        <div className="xui-mass-edit-table-wrap">
          <div className="xui-lines-toolbar">
            <div className="flex items-center gap-1 ml-auto">
              <button type="button" className="xui-lines-icon-btn" onClick={load} title="Refresh">
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
              {(searchOpen || search) && (
                <button
                  type="button"
                  className="xui-lines-icon-btn"
                  onClick={() => {
                    setSearch("");
                    setSearchInput("");
                    setSearchOpen(false);
                    setPage(1);
                  }}
                  title="Clear filters"
                >
                  <FilterX size={16} />
                </button>
              )}
              <button type="button" className="xui-lines-icon-btn" title="Table view">
                <LayoutList size={16} />
              </button>
            </div>
          </div>

          {(searchOpen || search) && (
            <div
              className="px-4 py-2 border-b flex flex-wrap items-center gap-3 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              <label className="flex items-center gap-2 flex-1 min-w-[200px]">
                <span style={{ color: "var(--muted)" }}>Search</span>
                <input
                  type="search"
                  className="flex-1 rounded border px-3 py-1.5 text-sm bg-transparent"
                  style={{ borderColor: "var(--border)" }}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  autoFocus={searchOpen}
                />
              </label>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="xui-lines-table w-full text-sm min-w-[720px]">
              <thead>
                <tr>
                  <th className="xui-lines-th xui-lines-td--check">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((l) => selected.has(l.id))}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th className="xui-lines-th w-8">Sta</th>
                  <th
                    className="xui-lines-th cursor-pointer select-none"
                    onClick={() => toggleSort("username")}
                  >
                    Username{sort === "username" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th className="xui-lines-th">Password</th>
                  {panel === "admin" ? (
                    <th
                      className="xui-lines-th cursor-pointer select-none"
                      onClick={() => toggleSort("owner")}
                    >
                      Owner{sort === "owner" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                  ) : null}
                  <th
                    className="xui-lines-th cursor-pointer select-none"
                    onClick={() => toggleSort("expiresAt")}
                  >
                    Expire{sort === "expiresAt" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                  <th
                    className="xui-lines-th cursor-pointer select-none"
                    onClick={() => toggleSort("status")}
                  >
                    Ban{sort === "status" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="px-4 py-10 text-center" style={{ color: "var(--muted)" }}>
                      No lines found
                    </td>
                  </tr>
                ) : (
                  filtered.map((l, idx) => {
                    const exp = formatMassEditExpire(l.expiresAt);
                    const isActive = l.status === "ACTIVE" && new Date(l.expiresAt) > new Date();
                    return (
                      <tr key={l.id} className={idx % 2 === 0 ? "xui-lines-row--even" : "xui-lines-row--odd"}>
                        <td className="xui-lines-td xui-lines-td--check">
                          <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                        </td>
                        <td className="xui-lines-td text-center">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full"
                            title={l.status}
                            style={{
                              background: isActive ? "#22c55e" : l.status === "BANNED" ? "#ef4444" : "#9ca3af",
                            }}
                          />
                        </td>
                        <td className="xui-lines-td">
                          <CopyableCredential value={l.username} className="text-xs" />
                        </td>
                        <td className="xui-lines-td">
                          <CopyableCredential value={l.password} className="text-xs font-mono" />
                        </td>
                        {panel === "admin" ? (
                          <td className="xui-lines-td" style={{ color: "var(--muted)" }}>
                            {l.owner?.username ?? "admin"}
                          </td>
                        ) : null}
                        <td className="xui-lines-td whitespace-nowrap text-xs">
                          <span>
                            {exp.dateTime}{" "}
                            <span className={exp.expired ? "text-red-500" : ""}>({exp.relative})</span>
                          </span>
                        </td>
                        <td className="xui-lines-td">
                          <XuiPill value={l.status === "BANNED" ? "YES" : "NO"} variant={l.status === "BANNED" ? "yes" : "no"} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t text-sm"
            style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.08)" }}
          >
            <p style={{ color: "var(--muted)" }}>
              Total: <strong className="text-[var(--fg)]">{total.toLocaleString()}</strong> · This page:{" "}
              <strong className="text-[var(--fg)]">{filtered.length.toLocaleString()}</strong>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                Show entries
                <select
                  className="xui-lines-select py-1"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(parseInt(e.target.value, 10));
                    setPage(1);
                  }}
                >
                  {LIST_PAGE_SIZE_OPTIONS.map((n) => (
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
          </div>
        </div>

        <aside className="xui-mass-edit-form">
          <h2 className="xui-mass-edit-form-title">Mass Edit Form</h2>

          <MassEditTextField
            label="Password"
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
            placeholder="New password for selected lines"
          />
          <MassEditTextField
            label="Reseller Notes"
            value={form.resellerNotes}
            onChange={(v) => setForm({ ...form, resellerNotes: v })}
            multiline
            placeholder="Notes visible to resellers"
          />
          <MassEditTriStateField
            label="Enabled"
            value={form.enabled}
            onChange={(v) => setForm({ ...form, enabled: v })}
          />
          <MassEditTriStateField
            label="Can Watch Adult"
            value={form.canWatchAdult}
            onChange={(v) => setForm({ ...form, canWatchAdult: v })}
          />
          <MassEditTextField
            label="Allowed Countries"
            value={form.allowedCountries}
            onChange={(v) => setForm({ ...form, allowedCountries: v })}
            placeholder="US,GB,DE"
          />
          <MassEditTextField
            label="Allowed IP Addresses"
            value={form.allowedIps}
            onChange={(v) => setForm({ ...form, allowedIps: v })}
            multiline
            placeholder="One IP per line"
          />
          <MassEditTextField
            label="Allowed User-Agents"
            value={form.allowedUserAgents}
            onChange={(v) => setForm({ ...form, allowedUserAgents: v })}
            placeholder="Substring match, comma-separated"
          />
          <MassEditTextField
            label="Disallowed User-Agents"
            value={form.disallowedUserAgents}
            onChange={(v) => setForm({ ...form, disallowedUserAgents: v })}
            placeholder="Substring match, comma-separated"
          />
          <MassEditTextField
            label="Blocked ISPs"
            value={form.blockedIsps}
            onChange={(v) => setForm({ ...form, blockedIsps: v })}
            placeholder="Verizon,AT&T"
          />
          <fieldset className="xui-mass-field">
            <legend className="xui-mass-field-label">Access Output</legend>
            <label className="flex items-center gap-2 text-xs mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!form.accessOutputsTouched}
                onChange={(e) =>
                  setForm({
                    ...form,
                    accessOutputsTouched: !e.target.checked,
                    accessOutputsSelected: e.target.checked
                      ? defaultAccessOutputSelection()
                      : form.accessOutputsSelected,
                  })
                }
              />
              Leave unchanged
            </label>
            {form.accessOutputsTouched ? (
              <AccessOutputCheckboxes
                selected={form.accessOutputsSelected}
                onChange={(accessOutputsSelected) =>
                  setForm({
                    ...form,
                    accessOutputsTouched: true,
                    accessOutputsSelected,
                    allowedOutputs: {
                      unchanged: false,
                      value: serializeAccessOutput(accessOutputsSelected) || DEFAULT_ALLOWED_OUTPUT,
                    },
                  })
                }
                legend=""
                hint="Apply these formats to all selected lines."
              />
            ) : (
              <button
                type="button"
                className="text-xs underline"
                style={{ color: "var(--accent)" }}
                onClick={() =>
                  setForm({
                    ...form,
                    accessOutputsTouched: true,
                    accessOutputsSelected: defaultAccessOutputSelection(),
                  })
                }
              >
                Edit Access Output (HLS / MPEGTS / RTMP)
              </button>
            )}
          </fieldset>
          <MassEditTriStateField
            label="Activate lock to"
            value={form.lockToIp}
            onChange={(v) => setForm({ ...form, lockToIp: v })}
          />

          {msg && (
            <p className="xui-mass-msg" style={{ color: msg.startsWith("Updated") ? "#4ade80" : "var(--danger)" }}>
              {msg}
            </p>
          )}

          <button
            type="button"
            className="xui-mass-apply-btn"
            disabled={busy || !selected.size}
            onClick={() => void apply()}
          >
            {busy ? "Applying…" : `Apply to ${selected.size} selected`}
          </button>
        </aside>
      </div>
    </div>
  );
}
