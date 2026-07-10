"use client";

import { useCallback, useEffect, useState } from "react";
import { DollarSign, CheckCircle, Clock, CreditCard } from "lucide-react";

type Commission = {
  id: string;
  amount: number;
  type: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
  affiliate: {
    user: { username: string; email: string | null };
  };
};

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "paid">("all");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    const params = filter !== "all" ? `?status=${filter}` : "";
    fetch(`/api/admin/commissions${params}`)
      .then((r) => r.json())
      .then((d) => setCommissions(d.commissions ?? []))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function markPaid(id: string) {
    await fetch("/api/admin/commissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "paid", paidAt: new Date().toISOString() }),
    });
    setMsg("Commission marked as paid");
    load();
  }

  async function approve(id: string) {
    await fetch("/api/admin/commissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "approved" }),
    });
    setMsg("Commission approved");
    load();
  }

  const totalPending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const totalApproved = commissions.filter((c) => c.status === "approved").reduce((s, c) => s + c.amount, 0);
  const totalPaid = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Commissions</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Track and manage affiliate commission payouts.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <Clock size={14} />
            Pending
          </div>
          <p className="text-xl font-bold mt-1">${totalPending.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <CheckCircle size={14} />
            Approved
          </div>
          <p className="text-xl font-bold mt-1">${totalApproved.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <CreditCard size={14} />
            Paid
          </div>
          <p className="text-xl font-bold mt-1">${totalPaid.toFixed(2)}</p>
        </div>
      </div>

      {msg && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          {msg}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "pending", "approved", "paid"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className="text-xs px-3 py-1.5 rounded-full cursor-pointer"
            style={{
              background: filter === f ? "var(--accent)" : "transparent",
              color: filter === f ? "#fff" : "var(--muted)",
              border: `1px solid ${filter === f ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12" style={{ color: "var(--muted)" }}>Loading…</div>
      ) : commissions.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--muted)" }}>
          <DollarSign size={48} className="mx-auto mb-4 opacity-30" />
          <p>No commissions found</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--card)" }}>
                <th className="text-left px-4 py-3">Affiliate</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Created</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.affiliate.user.username}</div>
                    {c.affiliate.user.email && (
                      <div className="text-xs" style={{ color: "var(--muted)" }}>{c.affiliate.user.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.1)", color: "#818cf8" }}>
                      {c.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">${c.amount.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        background: c.status === "paid" ? "rgba(34,197,94,0.1)" : c.status === "approved" ? "rgba(59,130,246,0.1)" : "rgba(251,191,36,0.1)",
                        color: c.status === "paid" ? "#22c55e" : c.status === "approved" ? "#3b82f6" : "#fbbf24",
                      }}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => approve(c.id)}
                        className="text-xs px-2 py-1 rounded cursor-pointer mr-1"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        Approve
                      </button>
                    )}
                    {c.status === "approved" && (
                      <button
                        type="button"
                        onClick={() => markPaid(c.id)}
                        className="text-xs px-2 py-1 rounded cursor-pointer"
                        style={{ background: "#22c55e", color: "#fff" }}
                      >
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
