"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import { isLicenseDeletable } from "@/lib/license-deletable";
import { licensePanelEndpoints } from "@/lib/license-endpoints";

type LicenseRow = {
  id: string;
  key: string;
  status: string;
  expiresAt: string | null;
  maxLines: number;
  notes: string | null;
  machineId: string | null;
  panelUrl: string | null;
  panelHost?: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  pendingSyncAction: string | null;
  user: { email: string; name: string | null };
  plan: { name: string; slug: string };
};

const PAGE_SIZES = [10, 25, 50, 100] as const;

const STATUS_OPTIONS = ["", "ACTIVE", "UNUSED", "SUSPENDED", "EXPIRED", "REVOKED"];

function Flash({ message, type }: { message: string; type: "ok" | "err" }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        type === "ok"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-red-500/30 bg-red-500/10 text-red-200"
      }`}
    >
      {message}
    </div>
  );
}

export function AdminPanel() {
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [issueEmail, setIssueEmail] = useState("");
  const [planId, setPlanId] = useState("");
  const [issueTerm, setIssueTerm] = useState<"plan" | "1m" | "3m" | "6m" | "1y" | "unlimited">("plan");
  const [issueMaxLines, setIssueMaxLines] = useState("");
  const [plans, setPlans] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [flash, setFlash] = useState<{ message: string; type: "ok" | "err" } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");

  const [extendId, setExtendId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState(30);
  const [upgradeToMonthly, setUpgradeToMonthly] = useState(false);
  const [notesEdit, setNotesEdit] = useState<{ id: string; notes: string } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set("q", search.trim());
    if (statusFilter) p.set("status", statusFilter);
    if (planFilter) p.set("plan", planFilter);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return `?${p.toString()}`;
  }, [search, statusFilter, planFilter, page, pageSize]);

  const notify = (message: string, type: "ok" | "err" = "ok") => {
    setFlash({ message, type });
    setTimeout(() => setFlash(null), 6000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/licenses${query}`);
    if (res.ok) {
      const data = await res.json();
      setLicenses(data.licenses);
      setTotalCount(data.summary?.total ?? data.licenses.length);
      setTotalPages(data.summary?.totalPages ?? 1);
    }
    setLoading(false);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, planFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSelected(new Set());
  }, [query]);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then((d) => {
        setPlans(d.plans ?? []);
        if (d.plans?.[0]) setPlanId(d.plans[0].id);
      });
  }, []);

  const deletableInView = useMemo(
    () => licenses.filter((l) => isLicenseDeletable({ status: l.status, expiresAt: l.expiresAt ? new Date(l.expiresAt) : null })),
    [licenses]
  );

  const deletableIds = useMemo(() => new Set(deletableInView.map((l) => l.id)), [deletableInView]);

  const selectedDeletable = useMemo(
    () => [...selected].filter((id) => deletableIds.has(id)),
    [selected, deletableIds]
  );

  const allDeletableSelected =
    deletableInView.length > 0 && deletableInView.every((l) => selected.has(l.id));

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
      notify(data.error ?? "Update failed", "err");
      return false;
    }
    load();
    return true;
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this license?")) return;
    await patchLicense(id, { status: "REVOKED" });
  }

  async function bulkRevoke() {
    const active = [...selected].filter((id) => {
      const lic = licenses.find((l) => l.id === id);
      return lic && lic.status !== "REVOKED" && lic.status !== "EXPIRED";
    });
    if (!active.length) return;
    if (!confirm(`Revoke ${active.length} selected license(s)? They can then be deleted.`)) return;
    setBusyId("bulk-revoke");
    let ok = 0;
    for (const id of active) {
      if (await patchLicense(id, { status: "REVOKED" })) ok++;
    }
    setBusyId(null);
    notify(`Revoked ${ok} license(s)`);
    setSelected(new Set());
  }

  async function removeLicenses(ids: string[]) {
    if (!ids.length) return;
    if (!confirm(`Permanently delete ${ids.length} license(s)? This cannot be undone.`)) return;
    setBusyId("bulk");
    const res = await fetch("/api/admin/licenses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok && res.status !== 207) {
      notify(data.error ?? "Delete failed", "err");
      return;
    }
    const msg = `Deleted ${data.deleted ?? 0}${data.skipped ? ` (${data.skipped} skipped — still active)` : ""}`;
    notify(data.warning ? `${msg}. ${data.warning}` : msg);
    setSelected(new Set());
    load();
  }

  async function issueManual(e: React.FormEvent) {
    e.preventDefault();
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
      notify(data.error ?? "Failed", "err");
      return;
    }
    notify(`Issued key: ${data.license.key}`);
    setIssueEmail("");
    load();
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key).then(
      () => notify(`Copied ${key}`),
      () => notify("Copy failed", "err")
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

  function toggleSelectAllDeletable() {
    if (allDeletableSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(deletableInView.map((l) => l.id)));
    }
  }

  const planSlugs = [...new Set(plans.map((p) => p.slug))];
  const now = Date.now();
  const extendingLic = extendId ? licenses.find((l) => l.id === extendId) : null;
  const canUpgradeTrial = extendingLic?.plan.slug === "trial";

  const activeLicenses = licenses.filter((l) => l.status === "ACTIVE");
  const onlineCount = activeLicenses.filter((l) => {
    if (!l.lastSyncAt) return false;
    return (now - new Date(l.lastSyncAt).getTime()) / 3600000 < 48;
  }).length;
  const installedCount = activeLicenses.filter((l) => l.machineId).length;

  return (
    <div className="space-y-6">
      {flash && <Flash message={flash.message} type={flash.type} />}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total (filtered)", value: totalCount, color: "text-white" },
          { label: "Shown", value: licenses.length, color: "text-slate-300" },
          { label: "Active", value: activeLicenses.length, color: "text-emerald-400" },
          { label: "Online (48h)", value: onlineCount, color: "text-emerald-400" },
          { label: "Deletable", value: deletableInView.length, color: "text-amber-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      <form
        onSubmit={issueManual}
        className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 max-w-lg space-y-4"
      >
        <h2 className="font-semibold text-white">Issue manual license</h2>
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
          placeholder="Max lines (optional)"
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
        <a
          href="/api/admin/licenses/export"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-violet-500/40 hover:text-white"
        >
          Export CSV
        </a>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-950/80 px-4 py-3 backdrop-blur">
          <span className="text-sm text-violet-200 font-medium">{selected.size} selected</span>
          {selectedDeletable.length > 0 && (
            <button
              type="button"
              onClick={() => removeLicenses(selectedDeletable)}
              disabled={busyId === "bulk"}
              className="rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              Delete deletable ({selectedDeletable.length})
            </button>
          )}
          <button
            type="button"
            onClick={bulkRevoke}
            disabled={busyId === "bulk-revoke"}
            className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
          >
            Revoke selected
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white"
          >
            Clear selection
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : licenses.length === 0 ? (
        <p className="text-slate-400 rounded-xl border border-slate-800 p-8 text-center">No licenses match filters.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Showing {licenses.length} of {totalCount} licenses (page {page} of {totalPages})
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <label className="flex items-center gap-2">
              Show
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              entries
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
                <tr>
                  <th className="px-2 py-3 w-10">
                    {deletableInView.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allDeletableSelected}
                        onChange={toggleSelectAllDeletable}
                        title="Select all deletable in view"
                        className="rounded border-slate-600"
                        aria-label="Select all deletable licenses"
                      />
                    )}
                  </th>
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
                {licenses.map((lic) => {
                  const deletable = isLicenseDeletable({
                    status: lic.status,
                    expiresAt: lic.expiresAt ? new Date(lic.expiresAt) : null,
                  });
                  const endpoints = licensePanelEndpoints(lic);
                  return (
                    <tr
                      key={lic.id}
                      className={`border-b border-slate-800/80 align-top ${selected.has(lic.id) ? "bg-violet-950/20" : ""}`}
                    >
                      <td className="px-2 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(lic.id)}
                          onChange={() => toggleSelect(lic.id)}
                          className="rounded border-slate-600"
                          aria-label={`Select ${lic.key}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => copyKey(lic.key)}
                          className="font-mono text-xs text-cyan-300 hover:underline text-left break-all"
                        >
                          {lic.key}
                        </button>
                        {endpoints.domain && (
                          <p className="mt-1 text-[10px] text-emerald-500/80 truncate max-w-[200px]" title={endpoints.domain}>
                            {endpoints.domain}
                          </p>
                        )}
                        {endpoints.ip && (
                          <p className="mt-0.5 text-[10px] text-emerald-500/80 truncate max-w-[200px]" title={endpoints.ip}>
                            {endpoints.ip}
                          </p>
                        )}
                        {lic.pendingSyncAction && (
                          <p className="mt-1 text-[10px] text-amber-400">pending: {lic.pendingSyncAction}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">{lic.user.email}</td>
                      <td className="px-4 py-3">{lic.plan.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            lic.status === "ACTIVE"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : lic.status === "REVOKED" || lic.status === "EXPIRED"
                                ? "bg-red-500/15 text-red-300"
                                : lic.status === "SUSPENDED"
                                  ? "bg-amber-500/15 text-amber-300"
                                  : "bg-slate-700 text-slate-300"
                          }`}
                        >
                          {lic.status}
                        </span>
                        {!deletable && lic.status === "ACTIVE" && (
                          <p className="mt-1 text-[10px] text-slate-500">Revoke first to delete</p>
                        )}
                      </td>
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
                          <button type="button" onClick={() => copyKey(lic.key)} className="text-cyan-400 hover:underline">
                            Copy
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExtendId(lic.id);
                              setExtendDays(lic.plan.slug === "trial" ? 30 : 30);
                              setUpgradeToMonthly(lic.plan.slug === "trial");
                            }}
                            className="text-emerald-400 hover:underline"
                          >
                            Extend
                          </button>
                          {lic.status === "SUSPENDED" && (
                            <button
                              type="button"
                              onClick={() => patchLicense(lic.id, { status: "ACTIVE" })}
                              disabled={busyId === lic.id}
                              className="text-violet-400 hover:underline disabled:opacity-50"
                            >
                              Unsuspend
                            </button>
                          )}
                          {lic.status !== "SUSPENDED" && lic.status !== "REVOKED" && lic.status !== "EXPIRED" && (
                            <button
                              type="button"
                              onClick={() => patchLicense(lic.id, { status: "SUSPENDED" })}
                              disabled={busyId === lic.id}
                              className="text-amber-400 hover:underline disabled:opacity-50"
                            >
                              Hold
                            </button>
                          )}
                          {lic.status !== "REVOKED" && (
                            <button
                              type="button"
                              onClick={() => revoke(lic.id)}
                              disabled={busyId === lic.id}
                              className="text-red-400 hover:underline disabled:opacity-50"
                            >
                              Revoke
                            </button>
                          )}
                          {deletable && (
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {extendId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!extendId) return;
              const body: Record<string, unknown> = { extendDays };
              if (upgradeToMonthly && canUpgradeTrial) {
                body.upgradePlanSlug = "nexlify";
              }
              await patchLicense(extendId, body);
              setExtendId(null);
              setUpgradeToMonthly(false);
            }}
            className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4"
          >
            <h3 className="font-semibold text-white">Extend license</h3>
            <p className="text-xs text-slate-400">Keeps the same license key — expiry is updated on the vendor side.</p>
            {canUpgradeTrial && (
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={upgradeToMonthly}
                  onChange={(e) => setUpgradeToMonthly(e.target.checked)}
                  className="rounded border-slate-600"
                />
                Upgrade 7-day trial to monthly (nexlify plan)
              </label>
            )}
            <input
              type="number"
              min={1}
              max={3650}
              value={extendDays}
              onChange={(e) => setExtendDays(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setExtendId(null)} className="px-4 py-2 text-sm text-slate-400">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white">
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
              <button type="button" onClick={() => setNotesEdit(null)} className="px-4 py-2 text-sm text-slate-400">
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!notesEdit) return;
                  await patchLicense(notesEdit.id, { notes: notesEdit.notes });
                  setNotesEdit(null);
                }}
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
