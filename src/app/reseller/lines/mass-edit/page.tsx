"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Line = {
  id: string;
  username: string;
  status: string;
  expiresAt: string;
};

export default function ResellerLinesMassEditPage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bouquets, setBouquets] = useState<{ id: string; name: string }[]>([]);
  const [action, setAction] = useState("disable");
  const [days, setDays] = useState(30);
  const [bouquetIds, setBouquetIds] = useState<string[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/lines")
      .then((r) => r.json())
      .then((d) => setLines(d.lines));
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) => setBouquets(d.bouquets));
  }, []);

  function toggleAll() {
    if (selected.size === lines.length) setSelected(new Set());
    else setSelected(new Set(lines.map((l) => l.id)));
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function apply() {
    if (!selected.size) {
      setMsg("Select at least one line");
      return;
    }
    if (action === "delete" && !confirm(`Delete ${selected.size} lines?`)) return;

    const res = await fetch("/api/admin/lines/mass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lineIds: Array.from(selected),
        action,
        days,
        bouquetIds,
      }),
    });
    const data = await res.json();
    setMsg(res.ok ? `Updated ${data.affected} lines` : data.error);
    setSelected(new Set());
    const refreshed = await fetch("/api/admin/lines").then((r) => r.json());
    setLines(refreshed.lines);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Mass edit lines</h1>
        <Link href="/reseller/lines" className="text-sm" style={{ color: "var(--accent)" }}>
          ← Manage lines
        </Link>
      </div>

      <div
        className="rounded-lg border p-4 grid md:grid-cols-4 gap-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <select
          className="rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="enable">Enable</option>
          <option value="disable">Disable</option>
          <option value="ban">Ban</option>
          <option value="extend">Extend expiry</option>
          <option value="set_bouquets">Set bouquets</option>
          <option value="delete">Delete</option>
        </select>
        {action === "extend" && (
          <input
            type="number"
            className="rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            placeholder="Days"
          />
        )}
        {action === "set_bouquets" && (
          <select
            multiple
            className="rounded border px-3 py-2 bg-transparent md:col-span-2"
            style={{ borderColor: "var(--border)" }}
            value={bouquetIds}
            onChange={(e) =>
              setBouquetIds(Array.from(e.target.selectedOptions, (o) => o.value))
            }
          >
            {bouquets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={apply}
          className="rounded py-2 font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Apply to {selected.size} selected
        </button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "var(--bg-card)" }}>
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selected.size === lines.length && lines.length > 0}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-4 py-3 text-left">Username</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Expires</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2">
                  <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                </td>
                <td className="px-4 py-2">{l.username}</td>
                <td className="px-4 py-2">{l.status}</td>
                <td className="px-4 py-2">{new Date(l.expiresAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
