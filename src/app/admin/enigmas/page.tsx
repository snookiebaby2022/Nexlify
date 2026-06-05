"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";

export default function AdminEnigmasPage() {
  const [devices, setDevices] = useState<
    { id: string; mac: string; model: string | null; isActive: boolean; line: { username: string } }[]
  >([]);
  const [lines, setLines] = useState<{ id: string; username: string }[]>([]);
  const [form, setForm] = useState({ mac: "", lineId: "", model: "" });
  const [portalUrl, setPortalUrl] = useState("—");

  function load() {
    fetch("/api/admin/enigma")
      .then((r) => r.json())
      .then((d) => setDevices(d.devices));
    fetch("/api/admin/lines")
      .then((r) => r.json())
      .then((d) => setLines(d.lines));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    fetch("/api/admin/portal-urls")
      .then((r) => r.json())
      .then((d) => setPortalUrl(d.enigmaServerUrl || d.magServerUrl || "—"))
      .catch(() => {});
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/enigma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      alert((await res.json()).error ?? "Failed");
      return;
    }
    setForm({ mac: "", lineId: "", model: "" });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/enigma?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Enigma2 devices</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Portal: <code>{portalUrl}</code>
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/enigmas/bulk" className="text-sm px-3 py-2 rounded-md border" style={{ borderColor: "var(--border)" }}>
            Bulk add
          </Link>
          <Link href="/admin/mag" className="text-sm" style={{ color: "var(--accent)" }}>
            MAG devices →
          </Link>
        </div>
      </div>

      <form
        id="enigma-add-form"
        onSubmit={add}
        className="rounded-lg border p-4 grid md:grid-cols-4 gap-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <input
          placeholder="MAC (AA:BB:CC:DD:EE:FF)"
          required
          className="rounded border px-3 py-2 bg-transparent font-mono"
          style={{ borderColor: "var(--border)" }}
          value={form.mac}
          onChange={(e) => setForm({ ...form, mac: e.target.value })}
        />
        <select
          required
          className="rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.lineId}
          onChange={(e) => setForm({ ...form, lineId: e.target.value })}
        >
          <option value="">Line *</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.username}
            </option>
          ))}
        </select>
        <input
          placeholder="Model"
          className="rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
        />
        <button
          type="submit"
          className="rounded px-4 py-2 cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Add device
        </button>
      </form>

      <DataTable
        headers={["MAC", "Line", "Model", "Status", ""]}
        rows={devices.map((d) => [
          d.mac,
          d.line.username,
          d.model ?? "—",
          d.isActive ? "Active" : "Off",
          <span key={d.id} className="flex gap-2">
            <Link href={`/admin/enigmas/${d.id}/edit`} className="text-xs" style={{ color: "var(--accent)" }}>
              Edit
            </Link>
            <button
              type="button"
              className="text-xs cursor-pointer"
              style={{ color: "var(--danger)" }}
              onClick={() => remove(d.id)}
            >
              Remove
            </button>
          </span>,
        ])}
      />
    </div>
  );
}
