"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type User = { id: string; username: string; credits: number };

function ResellerCreditsContent() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get("userId") ?? "";
  const [users, setUsers] = useState<User[]>([]);
  const [myCredits, setMyCredits] = useState<number | null>(null);
  const [form, setForm] = useState({
    userId: preselect,
    action: "add" as "add" | "refund" | "deduct",
    amount: 10,
    note: "",
  });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/reseller/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.credits === "number") setMyCredits(d.credits);
      })
      .catch(() => setMyCredits(null));
    fetch("/api/reseller/users")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.users ?? []).map((u: User) => ({
          id: u.id,
          username: u.username,
          credits: u.credits,
        }));
        setUsers(list);
        if (preselect) setForm((f) => ({ ...f, userId: preselect }));
      });
  }, [preselect]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/reseller/users/credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Failed");
      return;
    }
    setMsg(
      `${form.action === "deduct" ? "Deducted" : form.action === "refund" ? "Refunded" : "Added"} ${Math.abs(data.delta)} credits → ${data.user.username} (balance ${data.balanceAfter})`
    );
    setUsers((prev) =>
      prev.map((u) => (u.id === data.user.id ? { ...u, credits: data.balanceAfter } : u))
    );
    setForm((f) => ({ ...f, note: "" }));
    setMyCredits((prev) => {
      if (prev == null) return prev;
      const next =
        form.action === "add"
          ? Math.max(0, prev - transferAmount)
          : form.action === "refund"
            ? prev + transferAmount
            : prev;
      window.dispatchEvent(new CustomEvent("nexlify-credits-updated", { detail: { credits: next } }));
      return next;
    });
  }

  const selected = users.find((u) => u.id === form.userId);
  const transferAmount = Math.max(0, Math.floor(form.amount) || 0);
  const myBalanceAfterAdd =
    myCredits != null && form.action === "add"
      ? Math.max(0, myCredits - transferAmount)
      : null;
  const myBalanceAfterRefund =
    myCredits != null && form.action === "refund"
      ? myCredits + transferAmount
      : null;
  const subBalanceAfter =
    selected && transferAmount > 0
      ? form.action === "deduct"
        ? Math.max(0, selected.credits - transferAmount)
        : selected.credits + transferAmount
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <h1 className="text-2xl font-semibold flex-1">Add credits to sub-reseller</h1>
        <Link href="/reseller/users" className="text-sm" style={{ color: "var(--accent)" }}>
          ← Manage users
        </Link>
      </div>

      <form
        onSubmit={submit}
        className="rounded-lg border p-4 space-y-4 max-w-2xl"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="grid md:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block" style={{ color: "var(--muted)" }}>
              Sub-reseller
            </span>
            <select
              required
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
            >
              <option value="">Select user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.credits} cr)
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block" style={{ color: "var(--muted)" }}>
              Action
            </span>
            <select
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.action}
              onChange={(e) => setForm({ ...form, action: e.target.value as typeof form.action })}
            >
              <option value="add">Add credits (from your balance)</option>
              <option value="refund">Refund to your balance</option>
              <option value="deduct">Deduct from sub-reseller</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block" style={{ color: "var(--muted)" }}>
              Amount
            </span>
            <input
              type="number"
              min={1}
              required
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: parseInt(e.target.value, 10) || 0 })}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block" style={{ color: "var(--muted)" }}>
              Note (optional)
            </span>
            <input
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>
        </div>
        {selected && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Current balance for <strong>{selected.username}</strong>: {selected.credits} credits
            {subBalanceAfter != null && transferAmount > 0 ? (
              <>
                {" "}
                → <strong>{subBalanceAfter}</strong> after {form.action}
              </>
            ) : null}
          </p>
        )}
        {myCredits != null && form.action === "add" && transferAmount > 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Your balance: <strong>{myCredits}</strong>
            {myBalanceAfterAdd != null ? (
              <>
                {" "}
                → <strong>{myBalanceAfterAdd}</strong> left after transfer
              </>
            ) : null}
            {myCredits != null && myCredits < transferAmount ? (
              <span className="text-red-400"> (insufficient credits)</span>
            ) : null}
          </p>
        )}
        {myCredits != null && form.action === "refund" && transferAmount > 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Your balance: <strong>{myCredits}</strong>
            {myBalanceAfterRefund != null ? (
              <>
                {" "}
                → <strong>{myBalanceAfterRefund}</strong> after refund
              </>
            ) : null}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {[10, 25, 50, 100].map((n) => (
            <button
              key={n}
              type="button"
              className="text-xs px-3 py-1 rounded border cursor-pointer hover:bg-white/5"
              style={{ borderColor: "var(--border)" }}
              onClick={() => setForm((f) => ({ ...f, amount: n, action: "add" }))}
            >
              Quick +{n}
            </button>
          ))}
        </div>
        <button
          type="submit"
          className="rounded px-4 py-2 font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Apply
        </button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>
    </div>
  );
}

export default function ResellerUsersCreditsPage() {
  return (
    <Suspense fallback={<p className="text-sm p-6">Loading…</p>}>
      <ResellerCreditsContent />
    </Suspense>
  );
}
