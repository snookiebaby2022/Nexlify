"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { DataTable } from "@/components/data-table";

export default function ManagementCategoriesPage() {
  const [categories, setCategories] = useState<
    { id: string; name: string; sortOrder: number; _count: { streams: number } }[]
  >([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch("/api/admin/categories").then((r) => r.json()).then((d) => setCategories(d.categories));
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/categories?id=${id}`, { method: "DELETE" });
    load();
  }

  async function saveOrder(next: typeof categories) {
    setBusy(true);
    await fetch("/api/admin/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((c) => c.id) }),
    });
    setBusy(false);
    load();
  }

  function move(id: string, dir: -1 | 1) {
    const idx = categories.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= categories.length) return;
    const next = [...categories];
    [next[idx], next[j]] = [next[j], next[idx]];
    setCategories(next);
    saveOrder(next);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Categories</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Use the arrows to change display order in the panel and player APIs.
      </p>
      <form onSubmit={add} className="flex gap-2 max-w-md">
        <input
          placeholder="Category name"
          required
          className="flex-1 rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className="rounded px-4 py-2 cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Add
        </button>
      </form>
      <DataTable
        headers={["Order", "Name", "Streams", ""]}
        rows={categories.map((c, i) => [
          <span key={`ord-${c.id}`} className="flex items-center gap-1">
            <button
              type="button"
              disabled={busy || i === 0}
              className="p-1 rounded border cursor-pointer disabled:opacity-30"
              style={{ borderColor: "var(--border)" }}
              onClick={() => move(c.id, -1)}
              aria-label="Move up"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              disabled={busy || i === categories.length - 1}
              className="p-1 rounded border cursor-pointer disabled:opacity-30"
              style={{ borderColor: "var(--border)" }}
              onClick={() => move(c.id, 1)}
              aria-label="Move down"
            >
              <ArrowDown size={14} />
            </button>
            <span className="text-xs ml-1" style={{ color: "var(--muted)" }}>
              {i + 1}
            </span>
          </span>,
          c.name,
          c._count.streams,
          <button
            key={c.id}
            type="button"
            className="text-xs cursor-pointer"
            style={{ color: "var(--danger)" }}
            onClick={() => remove(c.id)}
          >
            Delete
          </button>,
        ])}
      />
    </div>
  );
}
