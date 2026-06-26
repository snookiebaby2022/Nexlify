"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<
    {
      id: string;
      name: string;
      sortOrder: number;
      parent?: { name: string } | null;
      _count: { streams: number };
    }[]
  >([]);
  const [form, setForm] = useState({ name: "", sortOrder: 0, parentId: "" });

  function load() {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories));
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        sortOrder: form.sortOrder,
        parentId: form.parentId || null,
      }),
    });
    setForm({ name: "", sortOrder: 0, parentId: "" });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/categories?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Categories</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Live/VOD categories shown in Xtream and MAG portals.
      </p>

      <form
        onSubmit={add}
        className="rounded-lg border p-4 grid md:grid-cols-4 gap-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <input
          placeholder="Category name"
          className="rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          type="number"
          placeholder="Sort order"
          className="rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.sortOrder}
          onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value, 10) })}
        />
        <select
          className="rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.parentId}
          onChange={(e) => setForm({ ...form, parentId: e.target.value })}
        >
          <option value="">No parent</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded py-2 font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Add category
        </button>
      </form>

      <DataTable
        headers={["Name", "Parent", "Order", "Streams", ""]}
        rows={categories.map((c) => [
          c.name,
          c.parent?.name ?? "—",
          c.sortOrder,
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
