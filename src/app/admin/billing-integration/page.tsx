"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Plus, Trash2, CreditCard, CheckCircle } from "lucide-react";

type BillingIntegration = {
  id: string;
  provider: string;
  apiKey: string;
  isActive: boolean;
};

type Invoice = {
  id: string;
  lineId: string;
  amount: number;
  status: string;
  createdAt: number;
  paidAt?: number;
};

export default function BillingIntegrationPage() {
  const [integrations, setIntegrations] = useState<BillingIntegration[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ provider: "stripe", apiKey: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/billing-integration");
      const data = await res.json();
      setIntegrations(data.integrations ?? []);
      setInvoices(data.invoices ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.apiKey) return;
    setLoading(true);
    try {
      await fetch("/api/admin/billing-integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_integration", ...form }),
      });
      setForm({ provider: "stripe", apiKey: "" });
      setShowCreate(false);
      load();
    } finally {
      setLoading(false);
    }
  };

  const markPaid = async (invoiceId: string) => {
    setLoading(true);
    try {
      await fetch("/api/admin/billing-integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_paid", invoiceId }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Billing Integration</h1>
        <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {integrations.map(i => (
          <div key={i.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-center gap-3 mb-2">
              <CreditCard size={20} style={{ color: "var(--accent)" }} />
              <span className="font-medium capitalize">{i.provider}</span>
            </div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>API Key: {i.apiKey.slice(0, 8)}...</div>
          </div>
        ))}
        <button onClick={() => setShowCreate(true)} className="rounded-xl border p-4 flex items-center justify-center gap-2 text-sm" style={{ borderColor: "var(--border)", borderStyle: "dashed" }}>
          <Plus size={16} /> Add Provider
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Add Billing Provider</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <select value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              <option value="stripe">Stripe</option>
              <option value="paypal">PayPal</option>
              <option value="whmcs">WHMCS</option>
            </select>
            <input value={form.apiKey} onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))} placeholder="API Key" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </div>
          <div className="flex gap-2">
            <button onClick={create} disabled={loading} className="px-3 py-1.5 rounded text-sm" style={{ background: "var(--accent)", color: "#fff" }}>Add</button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)" }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <div className="px-4 py-3 font-medium text-sm" style={{ borderBottom: "1px solid var(--border)" }}>Recent Invoices</div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="px-4 py-3 text-left font-medium">Line ID</th>
              <th className="px-4 py-3 text-left font-medium">Amount</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3 font-mono text-xs">{inv.lineId}</td>
                <td className="px-4 py-3">${inv.amount}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${inv.status === "paid" ? "bg-green-900/30 text-green-400" : "bg-yellow-900/30 text-yellow-400"}`}>{inv.status}</span></td>
                <td className="px-4 py-3 text-right">
                  {inv.status === "pending" && (
                    <button onClick={() => markPaid(inv.id)} className="p-1.5 rounded hover:bg-white/5 text-green-400" title="Mark Paid"><CheckCircle size={14} /></button>
                  )}
                </td>
              </tr>
            ))}
            {!invoices.length && (
              <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>No invoices</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
