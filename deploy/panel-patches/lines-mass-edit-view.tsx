"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  allowedOutputs: { unchanged: true } as TextFieldState,
  lockToIp: "unchanged" as TriState,
};

export function LinesMassEditView({ panel = "admin" }: { panel?: "admin" | "reseller" }) {
  const base = panel === "reseller" ? "/reseller" : "/admin";
  const [lines, setLines] = useState<ManageLineRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showInternal, setShowInternal] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  function load() {
    fetch("/api/admin/lines")
      .then((r) => r.json())
      .then((d) => setLines(d.lines ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = lines;
    if (showInternal) list = list.filter((l) => !l.externalId);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (l) =>
          l.username.toLowerCase().includes(q) ||
          l.password.toLowerCase().includes(q) ||
          l.id.toLowerCase().includes(q) ||
          (l.owner?.username ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [lines, search, showInternal]);

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
    if (!form.allowedOutputs.unchanged) patch.allowedOutputs = form.allowedOutputs;
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
          <Link href={`${base}/lines/add?package=1`} className="xui-lines-header-btn xui-lines-header-btn--outline">
            <PackagePlus size={16} />
            Add Line (with Package)
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
                    setSearchOpen(false);
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
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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
                  <th className="xui-lines-th">Username</th>
                  <th className="xui-lines-th">Password</th>
                  {panel === "admin" ? <th className="xui-lines-th">Owner</th> : null}
                  <th className="xui-lines-th">Expire</th>
                  <th className="xui-lines-th">Ban</th>
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
            label="Allowed Outputs"
            value={form.allowedOutputs}
            onChange={(v) => setForm({ ...form, allowedOutputs: v })}
            placeholder="ts,hls,m3u8"
          />
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
