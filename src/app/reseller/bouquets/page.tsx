"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Copy } from "lucide-react";

type Bouquet = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  ownerUserId?: string | null;
  contentCounts?: {
    live: number;
    movies: number;
    series: number;
    total: number;
  };
  _count?: { streams: number; lines: number };
};

export default function ResellerBouquetsPage() {
  const [bouquets, setBouquets] = useState<Bouquet[]>([]);
  const [name, setName] = useState("");
  const [duplicateId, setDuplicateId] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/reseller/bouquets")
      .then((r) => r.json())
      .then((d) => {
        setBouquets(d.bouquets ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createBouquet(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/reseller/bouquets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        duplicateId
          ? { name: name || undefined, duplicateOf: duplicateId }
          : { name, streamIds: [] }
      ),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Create failed");
      return;
    }
    setName("");
    setDuplicateId("");
    setMsg("Bouquet created");
    load();
  }

  async function remove(id: string, bouquetName: string) {
    if (!confirm(`Delete bouquet "${bouquetName}"? Lines using it will lose this bouquet.`)) return;
    const res = await fetch(`/api/reseller/bouquets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Delete failed");
      return;
    }
    load();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">My Bouquets</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Bouquets assigned to you plus custom lists you create. Use these when creating lines for customers.
        </p>
      </div>

      <form
        onSubmit={createBouquet}
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="font-medium text-sm">Create custom bouquet</h2>
        <input
          className="w-full rounded border px-3 py-2 text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          placeholder="Bouquet name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required={!duplicateId}
        />
        <select
          className="w-full rounded border px-3 py-2 text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={duplicateId}
          onChange={(e) => setDuplicateId(e.target.value)}
        >
          <option value="">— Or duplicate existing —</option>
          {bouquets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <Plus size={16} />
          Create bouquet
        </button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Channels</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  Loading...
                </td>
              </tr>
            )}
            {!loading && bouquets.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  No bouquets assigned yet — contact your provider.
                </td>
              </tr>
            )}
            {!loading &&
              bouquets.map((b) => {
                const total = b.contentCounts?.total ?? b._count?.streams ?? 0;
                const owned = Boolean(b.ownerUserId);
                return (
                  <tr key={b.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                    <td className="p-3 font-medium">
                      {b.name}
                      {owned ? (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>
                          Yours
                        </span>
                      ) : (
                        <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                          Assigned
                        </span>
                      )}
                    </td>
                    <td className="p-3">{total.toLocaleString()}</td>
                    <td className="p-3 text-xs" style={{ color: "var(--muted)" }}>
                      {b.isActive ? "Active" : "Disabled"}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/reseller/streams?bouquet=${b.id}`}
                          className="text-xs px-2 py-1 rounded border"
                          style={{ borderColor: "var(--border)" }}
                        >
                          Browse
                        </Link>
                        {owned && (
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded border inline-flex items-center gap-1 cursor-pointer"
                            style={{ borderColor: "var(--border)", color: "#ef4444" }}
                            onClick={() => void remove(b.id, b.name)}
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        )}
                        {!owned && (
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded border inline-flex items-center gap-1 cursor-pointer"
                            style={{ borderColor: "var(--border)" }}
                            onClick={() => {
                              setDuplicateId(b.id);
                              setName(`${b.name} (Copy)`);
                            }}
                          >
                            <Copy size={12} />
                            Duplicate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
