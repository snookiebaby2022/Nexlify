"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";

type OrderRow = {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  status: string;
  amountCents: number;
  couponCode: string | null;
  licenseKey: string | null;
  createdAt: string;
};

export function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/admin/orders?limit=100")
      .then((r) => r.json())
      .then((d) => setOrders(d.orders ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-slate-400 text-sm">Loading orders…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-white">Recent orders</h2>
        <a
          href="/api/admin/licenses/export"
          className="text-sm text-cyan-400 hover:underline"
        >
          Export licenses CSV
        </a>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Coupon</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">License</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No orders yet.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-800/80">
                  <td className="px-4 py-3 text-slate-400">{formatDate(o.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="text-white">{o.email}</div>
                    {o.name && <div className="text-xs text-slate-500">{o.name}</div>}
                  </td>
                  <td className="px-4 py-3">{o.plan}</td>
                  <td className="px-4 py-3">{formatMoney(o.amountCents)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-amber-300">
                    {o.couponCode ?? "—"}
                  </td>
                  <td className="px-4 py-3">{o.status}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-cyan-300">
                    {o.licenseKey ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
