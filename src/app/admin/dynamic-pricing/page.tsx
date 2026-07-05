"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Plus, Trash2, DollarSign } from "lucide-react";

type PricingRule = {
  id: string;
  name: string;
  basePrice: number;
  peakMultiplier: number;
  offPeakMultiplier: number;
  isActive: boolean;
};

export default function DynamicPricingPage() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", basePrice: 0, peakMultiplier: 1.5, offPeakMultiplier: 0.8 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/dynamic-pricing");
      const data = await res.json();
      setRules(data.rules ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name) return;
    setLoading(true);
    try {
      await fetch("/api/admin/dynamic-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...form }),
      });
      setForm({ name: "", basePrice: 0, peakMultiplier: 1.5, offPeakMultiplier: 0.8 });
      setShowCreate(false);
      load();
    } finally {
      setLoading(false);
    }
  };

  const remove = async (ruleId: string) => {
    if (!confirm("Delete this pricing rule?")) return;
    setLoading(true);
    try {
      await fetch("/api/admin/dynamic-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ruleId }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dynamic Pricing</h1>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded" style={{ background: "var(--accent)", color: "#fff" }}>
            <Plus size={12} /> New Rule
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Create Pricing Rule</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Rule name" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <input type="number" value={form.basePrice} onChange={e => setForm(p => ({ ...p, basePrice: +e.target.value }))} placeholder="Base price" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <input type="number" step="0.1" value={form.peakMultiplier} onChange={e => setForm(p => ({ ...p, peakMultiplier: +e.target.value }))} placeholder="Peak multiplier" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <input type="number" step="0.1" value={form.offPeakMultiplier} onChange={e => setForm(p => ({ ...p, offPeakMultiplier: +e.target.value }))} placeholder="Off-peak multiplier" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </div>
          <div className="flex gap-2">
            <button onClick={create} disabled={loading} className="px-3 py-1.5 rounded text-sm" style={{ background: "var(--accent)", color: "#fff" }}>Create</button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)" }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Base Price</th>
              <th className="px-4 py-3 text-left font-medium">Peak</th>
              <th className="px-4 py-3 text-left font-medium">Off-Peak</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3">${r.basePrice}</td>
                <td className="px-4 py-3">{r.peakMultiplier}x</td>
                <td className="px-4 py-3">{r.offPeakMultiplier}x</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => remove(r.id)} className="p-1.5 rounded hover:bg-white/5 text-red-400" title="Delete"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {!rules.length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>No pricing rules configured</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
