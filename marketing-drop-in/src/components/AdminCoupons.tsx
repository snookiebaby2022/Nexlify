"use client";

import { useCallback, useEffect, useState } from "react";

type Coupon = {
  code: string;
  label?: string;
  percentOff?: number;
  discountMonths?: number;
  maxRedemptions?: number;
  redemptionCount?: number;
  active?: boolean;
  expired?: boolean;
  soldOut?: boolean;
  remaining?: number;
};

export function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: "", percentOff: "50", maxRedemptions: "30", label: "" });

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/admin/coupons")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCoupons(data);
        else if (data.coupons) setCoupons(data.coupons);
        else if (data.error) setError(data.error);
        else setCoupons([]);
      })
      .catch(() => setError("Failed to connect to panel API"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async () => {
    if (!form.code.trim()) return;
    const res = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code.toUpperCase().trim(),
        percentOff: parseInt(form.percentOff) || 50,
        maxRedemptions: parseInt(form.maxRedemptions) || 30,
        label: form.label || undefined,
      }),
    });
    const data = await res.json();
    if (data.error) { setError(data.error); return; }
    setShowCreate(false);
    setForm({ code: "", percentOff: "50", maxRedemptions: "30", label: "" });
    load();
  }, [form, load]);

  const toggle = useCallback(async (code: string, active: boolean) => {
    await fetch("/api/admin/coupons", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, active: !active }),
    });
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-white">Coupons</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
          {showCreate ? "Cancel" : "+ New Coupon"}
        </button>
      </div>

      {error && <p className="text-sm text-amber-400 bg-amber-500/10 rounded-lg px-4 py-2">{error}</p>}

      {showCreate && (
        <section className="glass rounded-2xl p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-white">Create Coupon</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-slate-300">Code</label>
              <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="NEXLIFY50"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-300">Label (optional)</label>
              <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="50% launch discount"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-300">% Off</label>
              <input type="number" value={form.percentOff} onChange={(e) => setForm((f) => ({ ...f, percentOff: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-slate-300">Max Redemptions</label>
              <input type="number" value={form.maxRedemptions} onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none" />
            </div>
          </div>
          <button onClick={create} className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-500">Create</button>
        </section>
      )}

      {loading ? (
        <p className="text-slate-400 text-sm">Loading coupons…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Redemptions</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {coupons.map((c) => (
                <tr key={c.code}>
                  <td className="px-4 py-3 text-cyan-300 font-medium">{c.code}</td>
                  <td className="px-4 py-3">{c.percentOff ? `${c.percentOff}%` : c.discountMonths ? `${c.discountMonths}mo free` : "—"}</td>
                  <td className="px-4 py-3">{c.redemptionCount ?? 0}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}</td>
                  <td className="px-4 py-3">
                    <span className={c.active !== false && !c.expired && !c.soldOut ? "text-green-400" : "text-red-400"}>
                      {c.expired ? "expired" : c.soldOut ? "sold out" : c.active === false ? "disabled" : "active"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggle(c.code, c.active !== false)}
                      className="text-xs text-slate-400 hover:text-white">
                      {c.active !== false ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
              {!coupons.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No coupons found. Panel API may be unavailable.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
