"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { formatDateTime } from "@/lib/format";

type User = { id: string; username: string; credits: number; role: string };

export default function AdminResellerCreditsPage() {
  const [transactions, setTransactions] = useState<
    {
      id: string;
      amount: number;
      balanceAfter: number;
      note: string | null;
      createdAt: string;
      user: { username: string; role: string };
    }[]
  >([]);
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({
    userId: "",
    action: "add" as "add" | "refund" | "deduct",
    amount: 10,
    note: "",
  });
  const [msg, setMsg] = useState("");

  function load() {
    fetch("/api/admin/credits")
      .then((r) => r.json())
      .then((d) => {
        setTransactions(d.transactions ?? []);
        setUsers(d.users ?? []);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/credits", {
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
      `${form.action === "refund" ? "Refunded" : form.action === "deduct" ? "Deducted" : "Added"} ${Math.abs(data.delta)} credits → ${data.user.username} (balance ${data.balanceAfter})`
    );
    setForm((f) => ({ ...f, note: "" }));
    load();
  }

  const selected = users.find((u) => u.id === form.userId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <h1 className="text-2xl font-semibold flex-1">Credits</h1>
        <Link href="/admin/resellers" className="text-sm" style={{ color: "var(--accent)" }}>
          ← Resellers
        </Link>
      </div>

      <form
        onSubmit={submit}
        className="rounded-lg border p-4 space-y-4 max-w-2xl"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <p className="text-sm font-medium">Adjust reseller credits</p>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="block text-sm md:col-span-2">
            <span style={{ color: "var(--muted)" }}>Reseller</span>
            <select
              required
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
            >
              <option value="">Select…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.credits} credits)
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Action</span>
            <select
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.action}
              onChange={(e) =>
                setForm({ ...form, action: e.target.value as "add" | "refund" | "deduct" })
              }
            >
              <option value="add">Add credits</option>
              <option value="refund">Refund credits</option>
              <option value="deduct">Deduct credits</option>
            </select>
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Amount</span>
            <input
              type="number"
              min={1}
              required
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: parseInt(e.target.value, 10) || 0 })}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span style={{ color: "var(--muted)" }}>Note (optional)</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              placeholder={
                form.action === "refund"
                  ? "e.g. Refund for line #12345"
                  : "Reason for adjustment"
              }
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>
        </div>
        {selected && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Current balance: {selected.credits} credits
          </p>
        )}
        <button
          type="submit"
          className="rounded px-4 py-2 font-medium cursor-pointer"
          style={{
            background:
              form.action === "deduct" ? "var(--danger)" : form.action === "refund" ? "#22c55e" : "var(--accent)",
            color: "#fff",
          }}
        >
          {form.action === "refund" ? "Process refund" : form.action === "deduct" ? "Deduct" : "Add credits"}
        </button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>

      <DataTable
        headers={["Reseller", "Amount", "Balance after", "Note", "Time"]}
        rows={transactions.map((t) => [
          t.user.username,
          <span
            key={t.id}
            style={{
              color: t.amount > 0 ? "var(--success)" : "var(--danger)",
            }}
          >
            {t.amount > 0 ? `+${t.amount}` : t.amount}
          </span>,
          t.balanceAfter,
          t.note ?? "—",
          formatDateTime(t.createdAt),
        ])}
      />
    </div>
  );
}
