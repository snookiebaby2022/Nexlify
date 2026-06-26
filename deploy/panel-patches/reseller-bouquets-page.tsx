"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { XuiDualListPicker } from "@/components/xui-dual-list-picker";
import type { DualListItem } from "@/components/dual-list-picker";

type ResellerRow = {
  id: string;
  username: string;
  role: string;
  credits: number;
  resellerBouquets: { bouquet: { id: string; name: string; _count?: { streams: number } } }[];
};

type BouquetRow = {
  id: string;
  name: string;
  _count?: { streams: number; lines: number; resellerBouquets: number };
};

type MassAction = "set" | "add" | "remove" | "clear";

export default function AdminResellerBouquetsPage() {
  const [resellers, setResellers] = useState<ResellerRow[]>([]);
  const [bouquets, setBouquets] = useState<BouquetRow[]>([]);
  const [selected, setSelected] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [massSelected, setMassSelected] = useState<Set<string>>(new Set());
  const [massAction, setMassAction] = useState<MassAction>("set");
  const [massBouquetIds, setMassBouquetIds] = useState<string[]>([]);
  const [massSaving, setMassSaving] = useState(false);

  function load() {
    fetch("/api/admin/resellers/bouquets")
      .then((r) => r.json())
      .then((d) => {
        setResellers(d.resellers ?? []);
        setBouquets(d.bouquets ?? []);
      });
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const r = resellers.find((x) => x.id === selected);
    setPicked(r?.resellerBouquets.map((b) => b.bouquet.id) ?? []);
  }, [selected, resellers]);

  const pickerItems: DualListItem[] = useMemo(
    () =>
      bouquets.map((b) => ({
        id: b.id,
        label: b.name,
        sublabel: "LIVE",
        group: `${b._count?.streams ?? 0} streams`,
      })),
    [bouquets],
  );

  const selectedReseller = resellers.find((x) => x.id === selected);

  async function save() {
    if (!selected) return;
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/admin/resellers/bouquets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selected, bouquetIds: picked }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json();
      setMsg(j.error ?? "Save failed");
      return;
    }
    setMsg("Bouquet access saved.");
    load();
  }

  function toggleMass(id: string) {
    const next = new Set(massSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setMassSelected(next);
  }

  function toggleMassAll() {
    if (massSelected.size === resellers.length) setMassSelected(new Set());
    else setMassSelected(new Set(resellers.map((r) => r.id)));
  }

  async function applyMass() {
    if (!massSelected.size) {
      setMsg("Select at least one reseller for mass edit");
      return;
    }
    if (massAction === "clear" && !confirm(`Clear bouquet access for ${massSelected.size} user(s)?`)) return;
    if (
      (massAction === "set" || massAction === "add" || massAction === "remove") &&
      !massBouquetIds.length
    ) {
      setMsg(massAction === "set" ? "Pick bouquets to assign (or use Clear all)" : "Pick at least one bouquet");
      return;
    }

    setMassSaving(true);
    setMsg("");
    const res = await fetch("/api/admin/resellers/bouquets/mass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userIds: Array.from(massSelected),
        action: massAction,
        bouquetIds: massAction === "clear" ? [] : massBouquetIds,
      }),
    });
    setMassSaving(false);
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Mass edit failed");
      return;
    }
    setMsg(`Mass edit applied to ${data.affected} user(s).`);
    setMassSelected(new Set());
    load();
  }

  const massNeedsBouquets = massAction !== "clear";

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
        >
          <h1 className="text-lg font-semibold text-white">Reseller Bouquet Access</h1>
          <div className="flex gap-2">
            <Link
              href="/admin/management/mass-edit"
              className="text-sm px-3 py-1.5 rounded text-white border border-white/50 hover:bg-white/10"
            >
              Mass edit hub
            </Link>
            <Link
              href="/admin/bouquets"
              className="text-sm px-4 py-1.5 rounded text-white border border-white/70 hover:bg-white/10"
            >
              Manage Bouquets
            </Link>
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-4" style={{ background: "var(--bg-card)" }}>
          <div
            className="rounded-lg border px-4 py-3 text-sm leading-relaxed"
            style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.08)" }}
          >
            <p className="font-medium mb-2">What this controls</p>
            <ul className="list-disc list-inside space-y-1" style={{ color: "var(--muted)" }}>
              <li>Each reseller only sees bouquets you assign when creating or editing lines.</li>
              <li>Use <strong>Mass edit</strong> below to update many resellers at once.</li>
              <li>Sub-resellers inherit access from their parent unless assigned directly.</li>
            </ul>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded border px-3 py-2" style={{ borderColor: "var(--border)" }}>
              <div style={{ color: "var(--muted)" }}>Resellers</div>
              <div className="text-xl font-semibold tabular-nums">{resellers.length}</div>
            </div>
            <div className="rounded border px-3 py-2" style={{ borderColor: "var(--border)" }}>
              <div style={{ color: "var(--muted)" }}>Bouquets</div>
              <div className="text-xl font-semibold tabular-nums">{bouquets.length}</div>
            </div>
            <div className="rounded border px-3 py-2" style={{ borderColor: "var(--border)" }}>
              <div style={{ color: "var(--muted)" }}>With access</div>
              <div className="text-xl font-semibold tabular-nums">
                {resellers.filter((r) => r.resellerBouquets.length > 0).length}
              </div>
            </div>
          </div>

          <label className="block text-sm">
            <span className="font-medium">Single user — reseller / sub-reseller</span>
            <select
              className="panel-select mt-1.5 w-full rounded border px-3 py-2.5 text-sm"
              style={{ borderColor: "var(--border)", background: "#fff", color: "#111" }}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select user…</option>
              {resellers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.username} ({r.role}) — {r.resellerBouquets.length} bouquet(s)
                </option>
              ))}
            </select>
          </label>

          {selectedReseller && (
            <>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Assign bouquets for <strong>{selectedReseller.username}</strong>. Currently:{" "}
                {selectedReseller.resellerBouquets.length
                  ? selectedReseller.resellerBouquets.map((b) => b.bouquet.name).join(", ")
                  : "none"}
              </p>

              <XuiDualListPicker
                items={pickerItems}
                allItems={pickerItems}
                selectedIds={picked}
                onChange={setPicked}
                emptySelectedLabel="No bouquets assigned"
              />

              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="btn-positive rounded px-6 py-2.5 font-medium disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save bouquet access"}
              </button>
            </>
          )}
        </div>
      </div>

      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div
          className="px-4 py-3 border-b text-sm font-semibold"
          style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.1)" }}
        >
          Mass edit bouquet access
        </div>
        <div className="p-4 space-y-4">
          <div className="grid md:grid-cols-4 gap-3 items-start">
            <label className="block text-sm md:col-span-1">
              <span className="font-medium">Action</span>
              <select
                className="panel-select mt-1.5 w-full rounded border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
                value={massAction}
                onChange={(e) => setMassAction(e.target.value as MassAction)}
              >
                <option value="set">Set bouquets (replace)</option>
                <option value="add">Add bouquets</option>
                <option value="remove">Remove bouquets</option>
                <option value="clear">Clear all access</option>
              </select>
            </label>

            {massNeedsBouquets && (
              <label className="block text-sm md:col-span-2">
                <span className="font-medium">Bouquets</span>
                <select
                  multiple
                  className="mt-1.5 w-full rounded border px-3 py-2 text-sm min-h-[88px]"
                  style={{ borderColor: "var(--border)" }}
                  value={massBouquetIds}
                  onChange={(e) =>
                    setMassBouquetIds(Array.from(e.target.selectedOptions, (o) => o.value))
                  }
                >
                  {bouquets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b._count?.streams ?? 0} streams)
                    </option>
                  ))}
                </select>
                <span className="text-xs mt-1 block" style={{ color: "var(--muted)" }}>
                  Hold Ctrl/Cmd to select multiple
                </span>
              </label>
            )}

            <button
              type="button"
              disabled={massSaving || !massSelected.size}
              onClick={applyMass}
              className="rounded px-4 py-2.5 font-medium text-white disabled:opacity-50 md:mt-6"
              style={{ background: "var(--accent)" }}
            >
              {massSaving ? "Applying…" : `Apply to ${massSelected.size} selected`}
            </button>
          </div>
        </div>

        <div className="px-4 py-2 border-t text-sm font-medium" style={{ borderColor: "var(--border)" }}>
          Access overview — select users for mass edit
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs border-b" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                <th className="px-4 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={massSelected.size === resellers.length && resellers.length > 0}
                    onChange={toggleMassAll}
                  />
                </th>
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Bouquets</th>
                <th className="px-4 py-2">Credits</th>
              </tr>
            </thead>
            <tbody>
              {resellers.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b hover:bg-white/[0.03] ${massSelected.has(r.id) ? "bg-[rgba(0,192,239,0.06)]" : ""}`}
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={massSelected.has(r.id)}
                      onChange={() => toggleMass(r.id)}
                    />
                  </td>
                  <td className="px-4 py-2 font-medium">{r.username}</td>
                  <td className="px-4 py-2" style={{ color: "var(--muted)" }}>
                    {r.role}
                  </td>
                  <td className="px-4 py-2">
                    {r.resellerBouquets.length === 0 ? (
                      <span style={{ color: "var(--danger)" }}>None</span>
                    ) : (
                      r.resellerBouquets.map((b) => b.bouquet.name).join(", ")
                    )}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{r.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {msg && (
        <p className="text-sm" style={{ color: msg.includes("saved") || msg.includes("applied") ? "var(--success)" : "var(--danger)" }}>
          {msg}
        </p>
      )}
    </div>
  );
}
