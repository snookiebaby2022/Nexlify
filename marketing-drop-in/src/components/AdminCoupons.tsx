"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type CouponRow = {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  active: boolean;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  note: string | null;
};

export function AdminCoupons() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState("10");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/coupons")
      .then((r) => r.json())
      .then((d) => setCoupons(d.coupons ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        percentOff: Number(percentOff) || undefined,
        note: note || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Create failed");
      return;
    }
    setCode("");
    setNote("");
    load();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="max-w-lg space-y-3 rounded-xl border border-slate-800 p-4">
        <h2 className="font-semibold text-white">New coupon</h2>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <input
          required
          placeholder="CODE"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 uppercase text-white"
        />
        <input
          type="number"
          min={1}
          max={100}
          value={percentOff}
          onChange={(e) => setPercentOff(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        />
        <p className="text-xs text-slate-500">Percent off (1–100)</p>
        <input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        />
        <button type="submit" className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-slate-950">
          Create coupon
        </button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 text-slate-400">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Uses</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-b border-slate-800/80">
                <td className="px-4 py-3 font-mono text-white">{c.code}</td>
                <td className="px-4 py-3">
                  {c.percentOff != null ? `${c.percentOff}%` : `${((c.amountOffCents ?? 0) / 100).toFixed(2)} off`}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {c.usedCount}
                  {c.maxUses != null ? ` / ${c.maxUses}` : ""}
                </td>
                <td className="px-4 py-3">{c.active ? "Active" : "Off"}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="text-xs text-violet-400 hover:underline"
                    onClick={() =>
                      void fetch("/api/admin/coupons", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: c.id, active: !c.active }),
                      }).then(load)
                    }
                  >
                    {c.active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
