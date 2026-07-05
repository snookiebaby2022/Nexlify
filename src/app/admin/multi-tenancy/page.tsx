"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Plus, Trash2, Users } from "lucide-react";

type Tenant = {
  id: string;
  name: string;
  resellerId: string;
  branding: { logo?: string; primaryColor?: string; secondaryColor?: string };
  isActive: boolean;
};

export default function MultiTenancyPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", resellerId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/multi-tenancy");
      const data = await res.json();
      setTenants(data.tenants ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name || !form.resellerId) return;
    setLoading(true);
    try {
      await fetch("/api/admin/multi-tenancy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...form }),
      });
      setForm({ name: "", resellerId: "" });
      setShowCreate(false);
      load();
    } finally {
      setLoading(false);
    }
  };

  const remove = async (tenantId: string) => {
    if (!confirm("Delete this tenant?")) return;
    setLoading(true);
    try {
      await fetch("/api/admin/multi-tenancy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", tenantId }),
      });
      load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Multi-tenancy</h1>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded" style={{ background: "var(--accent)", color: "#fff" }}>
            <Plus size={12} /> New Tenant
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Create Tenant</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Tenant name" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <input value={form.resellerId} onChange={e => setForm(p => ({ ...p, resellerId: e.target.value }))} placeholder="Reseller ID" className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </div>
          <div className="flex gap-2">
            <button onClick={create} disabled={loading} className="px-3 py-1.5 rounded text-sm" style={{ background: "var(--accent)", color: "#fff" }}>Create</button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)" }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tenants.map(t => (
          <div key={t.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-center gap-3 mb-3">
              <Users size={24} style={{ color: "var(--accent)" }} />
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>Reseller: {t.resellerId}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs px-2 py-0.5 rounded ${t.isActive ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}`}>
                {t.isActive ? "Active" : "Inactive"}
              </span>
              <button onClick={() => remove(t.id)} className="p-1 rounded hover:bg-white/5 text-red-400" title="Delete"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
        {!tenants.length && (
          <div className="col-span-full text-center py-12" style={{ color: "var(--muted)" }}>No tenants configured</div>
        )}
      </div>
    </div>
  );
}
