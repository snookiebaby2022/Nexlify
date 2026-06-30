"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Coupon = {
  id: string;
  code: string;
  label: string | null;
  discountType: string;
  discountValue: number;
  maxUses: number;
  uses: number;
  isActive: boolean;
  expiresAt: string | null;
};

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState({
    code: "",
    label: "",
    discountType: "percent",
    discountValue: 10,
    maxUses: 0,
  });
  const [msg, setMsg] = useState("");

  function load() {
    fetch("/api/admin/coupons")
      .then((r) => r.json())
      .then((d) => setCoupons(d.coupons ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setMsg(res.ok ? "Coupon created" : (await res.json()).error);
    if (res.ok) {
      setForm({ code: "", label: "", discountType: "percent", discountValue: 10, maxUses: 0 });
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete coupon?")) return;
    await fetch(`/api/admin/coupons?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Coupons</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Discount codes for WHMCS or website checkout via{" "}
          <code className="text-xs">POST /api/billing/coupon</code>.
        </p>
      </div>

      <form
        onSubmit={create}
        className="rounded-lg border p-4 grid md:grid-cols-2 gap-4 max-w-3xl"
        style={{ borderColor: "var(--border)" }}
      >
        <label className="text-sm block">
          <span style={{ color: "var(--muted)" }}>Code</span>
          <input
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
        </label>
        <label className="text-sm block">
          <span style={{ color: "var(--muted)" }}>Label</span>
          <input
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </label>
        <label className="text-sm block">
          <span style={{ color: "var(--muted)" }}>Discount %</span>
          <input
            type="number"
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.discountValue}
            onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm block">
          <span style={{ color: "var(--muted)" }}>Max uses (0 = unlimited)</span>
          <input
            type="number"
            className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={form.maxUses}
            onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })}
          />
        </label>
        <button
          type="submit"
          className="md:col-span-2 rounded py-2 px-4 font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Add coupon
        </button>
        {msg && (
          <p className="md:col-span-2 text-sm" style={{ color: "var(--muted)" }}>
            {msg}
          </p>
        )}
      </form>

      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="text-left p-3">Code</th>
              <th className="text-left p-3">Discount</th>
              <th className="text-left p-3">Uses</th>
              <th className="text-left p-3">Active</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3 font-mono">{c.code}</td>
                <td className="p-3">
                  {c.discountValue}
                  {c.discountType === "percent" ? "%" : " flat"}
                </td>
                <td className="p-3">
                  {c.uses}
                  {c.maxUses > 0 ? ` / ${c.maxUses}` : ""}
                </td>
                <td className="p-3">{c.isActive ? "Yes" : "No"}</td>
                <td className="p-3 text-right">
                  <button
                    type="button"
                    className="text-xs underline cursor-pointer"
                    style={{ color: "var(--danger)" }}
                    onClick={() => remove(c.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Link href="/admin/settings/billing" className="text-sm underline" style={{ color: "var(--accent)" }}>
        Billing settings (PayPal)
      </Link>
    </div>
  );
}
