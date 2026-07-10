"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users, DollarSign, TrendingUp, Copy, Check } from "lucide-react";

type Affiliate = {
  id: string;
  userId: string;
  referralCode: string;
  commissionRate: number;
  isActive: boolean;
  totalReferrals: number;
  totalCommissions: number;
  user: { id: string; username: string; email: string | null };
  _count: { referrals: number; commissions: number };
};

export default function AffiliatesPage() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newRate, setNewRate] = useState(0.1);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/affiliates")
      .then((r) => r.json())
      .then((d) => setAffiliates(d.affiliates ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addAffiliate() {
    if (!newUserId) return;
    const res = await fetch("/api/admin/affiliates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: newUserId, commissionRate: newRate }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`Affiliate created: ${data.affiliate.referralCode}`);
      setShowAdd(false);
      setNewUserId("");
      load();
    } else {
      setMsg(data.error ?? "Failed");
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch("/api/admin/affiliates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive: !isActive }),
    });
    load();
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Affiliates & Referrals</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Manage affiliate partners, referral codes, and commission payouts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 rounded text-sm font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Add Affiliate
        </button>
      </div>

      {msg && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          {msg}
        </div>
      )}

      {showAdd && (
        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <h3 className="text-sm font-semibold">Add New Affiliate</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              placeholder="User ID"
              className="rounded border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
            />
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              placeholder="Commission rate (0.1 = 10%)"
              className="rounded border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={newRate}
              onChange={(e) => setNewRate(parseFloat(e.target.value) || 0)}
            />
            <button
              type="button"
              onClick={addAffiliate}
              className="rounded px-4 py-2 text-sm font-medium cursor-pointer"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Create
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12" style={{ color: "var(--muted)" }}>Loading…</div>
      ) : affiliates.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--muted)" }}>
          <Users size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg mb-2">No affiliates yet</p>
          <p className="text-sm">Add an affiliate to start tracking referrals and commissions.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {affiliates.map((a) => (
            <div
              key={a.id}
              className="rounded-lg border p-4"
              style={{ borderColor: "var(--border)", background: "var(--card)", opacity: a.isActive ? 1 : 0.6 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium">{a.user.username}</h3>
                    {!a.isActive && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                        Inactive
                      </span>
                    )}
                  </div>
                  {a.user.email && (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{a.user.email}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "var(--muted)" }}>
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {a._count.referrals} referrals
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign size={12} />
                      {a._count.commissions} commissions
                    </span>
                    <span className="flex items-center gap-1">
                      <TrendingUp size={12} />
                      {(a.commissionRate * 100).toFixed(0)}% rate
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyCode(a.referralCode)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer"
                    style={{ border: "1px solid var(--border)" }}
                    title="Copy referral code"
                  >
                    {copied === a.referralCode ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    {a.referralCode}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(a.id, a.isActive)}
                    className="px-2 py-1 rounded text-xs cursor-pointer"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    {a.isActive ? "Disable" : "Enable"}
                  </button>
                  <Link
                    href={`/admin/affiliates/${a.id}`}
                    className="px-2 py-1 rounded text-xs"
                    style={{ border: "1px solid var(--border)", color: "var(--accent)" }}
                  >
                    Details
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
