"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function SettingsForm({
  group,
  title,
  description,
  fields,
  backHref = "/admin/settings",
}: {
  group: string;
  title: string;
  description: string;
  fields: {
    key: string;
    label: string;
    type?: "text" | "number" | "password" | "checkbox" | "textarea" | "select";
    options?: { value: string; label: string }[];
    placeholder?: string;
    hint?: string;
  }[];
  backHref?: string;
}) {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/settings?group=${group}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d.settings ?? {});
        setLoading(false);
      });
  }, [group]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group, settings: data }),
    });
    const j = await res.json();
    setMsg(res.ok ? "Saved" : j.error ?? "Failed");
  }

  if (loading) return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap gap-3 items-center">
        <h1 className="text-2xl font-semibold flex-1">{title}</h1>
        <Link href={backHref} className="text-sm" style={{ color: "var(--accent)" }}>← Settings</Link>
      </div>
      <p className="text-sm" style={{ color: "var(--muted)" }}>{description}</p>
      <form onSubmit={save} className="rounded-lg border p-6 space-y-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        {fields.map((f) => (
          <label key={f.key} className="block text-sm">
            <span style={{ color: "var(--muted)" }}>{f.label}</span>
            {f.type === "checkbox" ? (
              <input
                type="checkbox"
                className="mt-2 block"
                checked={Boolean(data[f.key])}
                onChange={(e) => setData({ ...data, [f.key]: e.target.checked })}
              />
            ) : f.type === "textarea" ? (
              <textarea
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
                style={{ borderColor: "var(--border)" }}
                rows={3}
                value={String(data[f.key] ?? "")}
                onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
              />
            ) : f.type === "select" && f.options ? (
              <select
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
                style={{ borderColor: "var(--border)" }}
                value={String(data[f.key] ?? "")}
                onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === "number" ? "number" : f.type === "password" ? "password" : "text"}
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
                style={{ borderColor: "var(--border)" }}
                placeholder={f.placeholder}
                value={String(data[f.key] ?? "")}
                onChange={(e) =>
                  setData({
                    ...data,
                    [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value,
                  })
                }
              />
            )}
            {f.hint && <span className="block text-xs mt-1" style={{ color: "var(--muted)" }}>{f.hint}</span>}
          </label>
        ))}
        <button type="submit" className="rounded px-4 py-2 cursor-pointer" style={{ background: "var(--accent)", color: "#fff" }}>
          Save settings
        </button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>
    </div>
  );
}
