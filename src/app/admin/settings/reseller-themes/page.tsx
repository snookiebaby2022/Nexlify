"use client";

import { useEffect, useState } from "react";

export default function ResellerThemesPage() {
  const [groups, setGroups] = useState<
    { id: string; name: string; config: { whiteLabel?: Record<string, string> } }[]
  >([]);
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({
    logoUrl: "",
    accentColor: "#22d3ee",
    themeMode: "dark",
    backgroundColor: "#0f172a",
    sidebarColor: "#1e293b",
    faviconUrl: "",
    customCss: "",
  });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/groups")
      .then((r) => r.json())
      .then((d) => setGroups(Array.isArray(d.groups) ? d.groups : []));
  }, []);

  useEffect(() => {
    const g = groups.find((x) => x.id === selected);
    const wl = g?.config?.whiteLabel ?? {};
    setForm({
      logoUrl: String(wl.logoUrl ?? ""),
      accentColor: String(wl.accentColor ?? "#22d3ee"),
      themeMode: String(wl.themeMode ?? "dark"),
      backgroundColor: String(wl.backgroundColor ?? "#0f172a"),
      sidebarColor: String(wl.sidebarColor ?? "#1e293b"),
      faviconUrl: String(wl.faviconUrl ?? ""),
      customCss: String(wl.customCss ?? ""),
    });
  }, [selected, groups]);

  async function save() {
    if (!selected) return;
    setMsg("");
    const g = groups.find((x) => x.id === selected);
    const merged = {
      ...(g?.config ?? {}),
      whiteLabel: { ...(g?.config?.whiteLabel ?? {}), ...form },
    };
    const res = await fetch(`/api/admin/groups`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected, config: merged }),
    });
    if (!res.ok) {
      setMsg("Save failed");
      return;
    }
    setMsg("Reseller theme saved.");
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Reseller sub-panel themes</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          XUI-style white-label skin per reseller group — logo, accent, sidebar, and custom CSS.
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          Reseller group
        </span>
        <select
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Select group…</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <div className="grid md:grid-cols-2 gap-4">
          {(
            [
              ["logoUrl", "Logo URL"],
              ["faviconUrl", "Favicon URL"],
              ["accentColor", "Accent color"],
              ["themeMode", "Theme (dark/light/auto)"],
              ["backgroundColor", "Background"],
              ["sidebarColor", "Sidebar"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block space-y-1">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {label}
              </span>
              <input
                className="w-full rounded border px-2 py-1.5 bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Custom CSS
            </span>
            <textarea
              rows={4}
              className="w-full rounded border px-2 py-1.5 bg-transparent text-sm font-mono"
              style={{ borderColor: "var(--border)" }}
              value={form.customCss}
              onChange={(e) => setForm({ ...form, customCss: e.target.value })}
            />
          </label>
        </div>
      ) : null}
      <button
        type="button"
        disabled={!selected}
        className="rounded px-4 py-2 text-sm cursor-pointer disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#fff" }}
        onClick={() => save()}
      >
        Save theme
      </button>
      {msg ? <p className="text-sm">{msg}</p> : null}
    </div>
  );
}
