"use client";

import { useEffect, useState } from "react";

type Line = {
  id: string;
  username: string;
  password: string;
  status: string;
  maxConnections: number;
  expiresAt: string;
  externalId?: string | null;
  lockToIp?: boolean;
  allowedIps?: string | null;
  bouquets: { bouquet: { id: string; name: string } }[];
};

export function LineActions({
  line,
  bouquets,
  onUpdated,
  startEditing,
  showEditButton = true,
}: {
  line: Line;
  bouquets: { id: string; name: string }[];
  onUpdated: () => void;
  startEditing?: boolean;
  showEditButton?: boolean;
}) {
  const [editing, setEditing] = useState(Boolean(startEditing));
  useEffect(() => {
    if (startEditing) setEditing(true);
  }, [startEditing]);

  const [form, setForm] = useState({
    password: line.password,
    maxConnections: line.maxConnections,
    days: 0,
    externalId: line.externalId ?? "",
    bouquetIds: line.bouquets.map((b) => b.bouquet.id),
    lockToIp: line.lockToIp ?? false,
    allowedIps: line.allowedIps ?? "",
  });

  async function setStatus(status: string) {
    await fetch(`/api/admin/lines/${line.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onUpdated();
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/admin/lines/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: form.password || undefined,
        maxConnections: form.maxConnections,
        days: form.days || undefined,
        externalId: form.externalId || null,
        bouquetIds: form.bouquetIds,
        lockToIp: form.lockToIp,
        allowedIps: form.allowedIps,
      }),
    });
    setEditing(false);
    onUpdated();
  }

  async function remove() {
    if (!confirm(`Delete line ${line.username}?`)) return;
    await fetch(`/api/admin/lines/${line.id}`, { method: "DELETE" });
    onUpdated();
  }

  if (editing) {
    return (
      <form onSubmit={saveEdit} className="flex flex-col gap-2 min-w-[200px]">
        <input
          className="rounded border px-2 py-1 text-xs bg-transparent"
          style={{ borderColor: "var(--border)" }}
          placeholder="New password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <input
          type="number"
          className="rounded border px-2 py-1 text-xs bg-transparent"
          style={{ borderColor: "var(--border)" }}
          placeholder="Max conn"
          value={form.maxConnections}
          onChange={(e) =>
            setForm({ ...form, maxConnections: parseInt(e.target.value, 10) })
          }
        />
        <input
          type="number"
          className="rounded border px-2 py-1 text-xs bg-transparent"
          style={{ borderColor: "var(--border)" }}
          placeholder="Extend days"
          value={form.days || ""}
          onChange={(e) => setForm({ ...form, days: parseInt(e.target.value, 10) || 0 })}
        />
        <input
          className="rounded border px-2 py-1 text-xs bg-transparent"
          style={{ borderColor: "var(--border)" }}
          placeholder="WHMCS service ID"
          value={form.externalId}
          onChange={(e) => setForm({ ...form, externalId: e.target.value })}
        />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={form.lockToIp}
            onChange={(e) => setForm({ ...form, lockToIp: e.target.checked })}
          />
          Lock to allowed IPs
        </label>
        <textarea
          placeholder="Allowed IPs (one per line)"
          className="rounded border px-2 py-1 text-xs bg-transparent font-mono"
          style={{ borderColor: "var(--border)" }}
          rows={2}
          value={form.allowedIps}
          onChange={(e) => setForm({ ...form, allowedIps: e.target.value })}
        />
        <select
          multiple
          className="rounded border px-2 py-1 text-xs bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.bouquetIds}
          onChange={(e) =>
            setForm({
              ...form,
              bouquetIds: Array.from(e.target.selectedOptions, (o) => o.value),
            })
          }
        >
          {bouquets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          <button
            type="submit"
            className="text-xs px-2 py-1 rounded cursor-pointer"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Save
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded cursor-pointer"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {showEditButton && (
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border cursor-pointer"
          style={{ borderColor: "var(--border)" }}
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      )}
      {line.status !== "ACTIVE" && (
        <button
          type="button"
          className="text-xs px-2 py-1 rounded cursor-pointer"
          style={{ background: "var(--success)", color: "#fff" }}
          onClick={() => setStatus("ACTIVE")}
        >
          Enable
        </button>
      )}
      {line.status === "ACTIVE" && (
        <button
          type="button"
          className="text-xs px-2 py-1 rounded cursor-pointer"
          style={{ background: "#64748b", color: "#fff" }}
          onClick={() => setStatus("DISABLED")}
        >
          Disable
        </button>
      )}
      {line.status !== "BANNED" && (
        <button
          type="button"
          className="text-xs px-2 py-1 rounded cursor-pointer"
          style={{ background: "var(--danger)", color: "#fff" }}
          onClick={() => setStatus("BANNED")}
        >
          Ban
        </button>
      )}
      <button
        type="button"
        className="text-xs px-2 py-1 rounded border cursor-pointer"
        style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        onClick={remove}
      >
        Delete
      </button>
    </div>
  );
}
