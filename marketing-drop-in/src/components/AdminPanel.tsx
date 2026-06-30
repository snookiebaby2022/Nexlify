"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format";

type LicenseRow = {
  id: string;
  key: string;
  status: string;
  expiresAt: string | null;
  maxLines: number;
  notes: string | null;
  machineId: string | null;
  panelUrl: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  pendingSyncAction: string | null;
  user: { email: string; name: string | null };
  plan: { name: string; slug: string };
};

function isDeletable(lic: Pick<LicenseRow, "status" | "expiresAt">): boolean {
  if (lic.status === "REVOKED" || lic.status === "EXPIRED") return true;
  if (lic.expiresAt && new Date(lic.expiresAt).getTime() < Date.now()) return true;
  return false;
}

const STATUS_OPTIONS = ["", "ACTIVE", "UNUSED", "SUSPENDED", "EXPIRED", "REVOKED"];

export function AdminPanel() {
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [issueEmail, setIssueEmail] = useState("");
  const [planId, setPlanId] = useState("");
  const [issueTerm, setIssueTerm] = useState<"plan" | "1m" | "3m" | "6m" | "1y" | "unlimited">("plan");
  const [issueMaxLines, setIssueMaxLines] = useState("");
  const [plans, setPlans] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");

  const [extendId, setExtendId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState(30);
  const [notesEdit, setNotesEdit] = useState<{ id: string; notes: string } | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set("q", search.trim());
    if (statusFilter) p.set("status", statusFilter);
    if (planFilter) p.set("plan", planFilter);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [search, statusFilter, planFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/licenses${query}`);
    if (res.ok) {
      const data = await res.json();
      setLicenses(data.licenses);
    }
    setLoading(false);
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then((d) => {
        setPlans(d.plans ?? []);
        if (d.plans?.[0]) setPlanId(d.plans[0].id);
      });
  }, []);

  async function patchLicense(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    const res = await fetch("/api/admin/licenses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Update failed");
      return;
    }
    load();
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this license?")) return;
    await patchLicense(id, { status: "REVOKED" });
  }

  async function reactivate(id: string) {
    await patchLicense(id, { reactivate: true });
  }

  async function unsuspend(id: string) {
    await patchLicense(id, { status: "ACTIVE" });
  }

  async function suspend(id: string) {
    if (!confirm("Suspend this license on the customer panel?")) return;
    await patchLicense(id, { status: "SUSPENDED" });
  }

  async function clearMachine(id: string) {
    if (!confirm("Clear machine binding?")) return;
    await patchLicense(id, { clearMachineId: true });
  }

  async function saveNotes() {
    if (!notesEdit) return;
    await patchLicense(notesEdit.id, { notes: notesEdit.notes });
    setNotesEdit(null);
  }

  async function submitExtend(e: React.FormEvent) {
    e.preventDefault();
    if (!extendId) return;
    await patchLicense(extendId, { extendDays });
    setExtendId(null);
  }

  async function removeLicenses(ids: string[]) {
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} license(s) permanently?`)) return;
    setBusyId("bulk");
    const res = await fetch("/api/admin/licenses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Delete failed");
      return;
    }
    setSelected(new Set());
    load();
  }

  async function issueManual(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const body: Record<string, unknown> = { email: issueEmail, planId };
    if (issueTerm !== "plan") {
      body.term = issueTerm;
      if (issueTerm === "unlimited") body.durationDays = 0;
    }
    const maxLines = issueMaxLines.trim();
    if (maxLines !== "") body.maxLines = Number(maxLines);

    const res = await fetch("/api/admin/licenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Failed");
      return;
    }
    const syncNote =
      data.sync?.pushed === true
        ? " — pushed to customer panel"
        : data.sync?.pushed === false
          ? ` — queued (panel will sync on next poll${data.sync?.error ? `: ${data.sync.error}` : ""})`
          : "";
    setMessage(`Issued key: ${data.license.key}${syncNote}`);
    setIssueEmail("");
    load();
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key).then(
      () => setMessage(`Copied ${key}`),
      () => alert("Copy failed"),
    );
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const deletableSelected = [...selected].filter((id) => {
    const lic = licenses.find((l) => l.id === id);
    return lic && isDeletable(lic);
  });

  const planSlugs = [...new Set(plans.map((p) => p.slug))];

  return (
    <div className="space-y-8">
      <form
        onSubmit={issueManual}
        className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 max-w-lg space-y-4"
      >
        <h2 className="font-semibold text-white">Issue manual license</h2>
        <p className="text-xs text-slate-400">
          Keys auto-push to registered customer panels (add / renew / revoke / hold). First activation on
          the panel registers its URL for future sync.
        </p>
        <input
          type="email"
          placeholder="Customer email"
          value={issueEmail}
          onChange={(e) => setIssueEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-white"
        />
        <select
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-white"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={issueTerm}
          onChange={(e) => setIssueTerm(e.target.value as typeof issueTerm)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-white"
        >
          <option value="plan">Duration — use plan default</option>
          <option value="1m">1 month</option>
          <option value="3m">3 months</option>
          <option value="6m">6 months</option>
          <option value="1y">1 year</option>
          <option value="unlimited">Unlimited (100 years)</option>
        </select>
        <input
          type="number"
          min={0}
          placeholder="Max lines (optional — 0 = unlimited, blank = plan default)"
          value={issueMaxLines}
          onChange={(e) => setIssueMaxLines(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-white"
        />
        <button
          type="submit"
          className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-400"
        >
          Issue key
        </button>
        {message && <p className="text-sm text-cyan-400">{message}</p>}
      </form>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-slate-400">Search</label>
          <input
            type="search"
            placeholder="Key, email, notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s || "all"} value={s}>
                {s || "All"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400">Plan</label>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">All</option>
            {planSlugs.map((slug) => (
              <option key={slug} value={slug}>
                {slug}
              </option>
            ))}
          </select>
        </div>
        {deletableSelected.length > 0 && (
          <button
            type="button"
            onClick={() => removeLicenses(deletableSelected)}
            disabled={busyId === "bulk"}
            className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10"
          >
            Delete selected ({deletableSelected.length})
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-2 py-3 w-8" />
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((lic) => (
                <tr key={lic.id} className="border-b border-slate-800/80 align-top">
                  <td className="px-2 py-3">
                    {isDeletable(lic) && (
                      <input
                        type="checkbox"
                        checked={selected.has(lic.id)}
                        onChange={() => toggleSelect(lic.id)}
                        className="rounded border-slate-600"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => copyKey(lic.key)}
                      className="font-mono text-xs text-cyan-300 hover:underline text-left"
                      title="Click to copy"
                    >
                      {lic.key}
                    </button>
                    {lic.machineId && (
                      <p className="mt-1 text-[10px] text-slate-500 truncate max-w-[120px]">
                        machine: {lic.machineId}
                      </p>
                    )}
                    {lic.panelUrl && (
                      <p className="mt-1 text-[10px] text-emerald-500/80 truncate max-w-[160px]" title={lic.panelUrl}>
                        panel: {lic.panelUrl}
                      </p>
                    )}
                    {lic.pendingSyncAction && (
                      <p className="mt-1 text-[10px] text-amber-400">
                        pending: {lic.pendingSyncAction}
                      </p>
                    )}
                    {lic.lastSyncError && (
                      <p className="mt-1 text-[10px] text-red-400 truncate max-w-[160px]" title={lic.lastSyncError}>
                        sync err: {lic.lastSyncError}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">{lic.user.email}</td>
                  <td className="px-4 py-3">{lic.plan.name}</td>
                  <td className="px-4 py-3">{lic.status}</td>
                  <td className="px-4 py-3">{formatDate(lic.expiresAt)}</td>
                  <td className="px-4 py-3 max-w-[140px]">
                    <button
                      type="button"
                      onClick={() => setNotesEdit({ id: lic.id, notes: lic.notes ?? "" })}
                      className="text-xs text-slate-400 hover:text-white truncate block max-w-full text-left"
                    >
                      {lic.notes || "Add notes…"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
                      <button
                        type="button"
                        onClick={() => copyKey(lic.key)}
                        className="text-cyan-400 hover:underline"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExtendId(lic.id);
                          setExtendDays(30);
                        }}
                        className="text-emerald-400 hover:underline"
                      >
                        Extend
                      </button>
                      {lic.status === "SUSPENDED" && (
                        <button
                          type="button"
                          onClick={() => unsuspend(lic.id)}
                          disabled={busyId === lic.id}
                          className="text-violet-400 hover:underline disabled:opacity-50"
                        >
                          Unsuspend
                        </button>
                      )}
                      {lic.status !== "SUSPENDED" &&
                        lic.status !== "REVOKED" &&
                        lic.status !== "EXPIRED" &&
                        lic.status !== "UNUSED" && (
                          <button
                            type="button"
                            onClick={() => suspend(lic.id)}
                            disabled={busyId === lic.id}
                            className="text-amber-400 hover:underline disabled:opacity-50"
                          >
                            Hold
                          </button>
                        )}
                      {(lic.status === "EXPIRED" || lic.status === "REVOKED") && (
                        <button
                          type="button"
                          onClick={() => reactivate(lic.id)}
                          disabled={busyId === lic.id}
                          className="text-violet-400 hover:underline disabled:opacity-50"
                        >
                          Reactivate
                        </button>
                      )}
                      {lic.machineId && (
                        <button
                          type="button"
                          onClick={() => clearMachine(lic.id)}
                          disabled={busyId === lic.id}
                          className="text-amber-400 hover:underline disabled:opacity-50"
                        >
                          Clear machine
                        </button>
                      )}
                      {lic.status !== "REVOKED" && lic.status !== "EXPIRED" && (
                        <button
                          type="button"
                          onClick={() => revoke(lic.id)}
                          disabled={busyId === lic.id}
                          className="text-red-400 hover:underline disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      )}
                      {isDeletable(lic) && (
                        <button
                          type="button"
                          onClick={() => removeLicenses([lic.id])}
                          disabled={busyId === lic.id}
                          className="text-slate-400 hover:text-red-300 hover:underline disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {extendId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={submitExtend}
            className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4"
          >
            <h3 className="font-semibold text-white">Extend license</h3>
            <input
              type="number"
              min={1}
              max={3650}
              value={extendDays}
              onChange={(e) => setExtendDays(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setExtendId(null)}
                className="px-4 py-2 text-sm text-slate-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white"
              >
                Extend
              </button>
            </div>
          </form>
        </div>
      )}

      {notesEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4">
            <h3 className="font-semibold text-white">Edit notes</h3>
            <textarea
              value={notesEdit.notes}
              onChange={(e) => setNotesEdit({ ...notesEdit, notes: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white text-sm"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setNotesEdit(null)}
                className="px-4 py-2 text-sm text-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveNotes}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
