"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ProfileRow = {
  id: string;
  mac: string;
  model: string | null;
  lineUsername: string;
  deviceType: string;
  isActive: boolean;
};

export default function AdminProfilesPage() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/mag").then((r) => r.json()),
      fetch("/api/admin/enigma").then((r) => r.json()),
    ]).then(([mag, enigma]) => {
      const magRows = (mag.devices ?? []).map(
        (d: { id: string; mac: string; model: string | null; isActive: boolean; line?: { username: string } }) => ({
          id: d.id,
          mac: d.mac,
          model: d.model,
          lineUsername: d.line?.username ?? "—",
          deviceType: "MAG",
          isActive: d.isActive,
        })
      );
      const enigmaRows = (enigma.devices ?? []).map(
        (d: { id: string; mac: string; model: string | null; isActive: boolean; line?: { username: string } }) => ({
          id: d.id,
          mac: d.mac,
          model: d.model,
          lineUsername: d.line?.username ?? "—",
          deviceType: "Enigma2",
          isActive: d.isActive,
        })
      );
      setRows([...magRows, ...enigmaRows]);
    });
  }, []);

  const filtered = rows.filter(
    (r) =>
      !q.trim() ||
      r.mac.toLowerCase().includes(q.toLowerCase()) ||
      r.lineUsername.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Device profiles</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          MAG and Enigma2 STB profiles bound to subscription lines.
        </p>
      </div>

      <input
        className="rounded border px-3 py-2 text-sm bg-transparent max-w-xs w-full"
        style={{ borderColor: "var(--border)" }}
        placeholder="Search MAC or line…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="text-left p-3">MAC</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Line</th>
              <th className="text-left p-3">Model</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3 font-mono text-xs">{r.mac}</td>
                <td className="p-3">{r.deviceType}</td>
                <td className="p-3">{r.lineUsername}</td>
                <td className="p-3">{r.model ?? "—"}</td>
                <td className="p-3">{r.isActive ? "Active" : "Disabled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/mag" style={{ color: "var(--accent)" }}>
          Manage MAG
        </Link>
        <Link href="/admin/enigmas" style={{ color: "var(--accent)" }}>
          Manage Enigma2
        </Link>
      </div>
    </div>
  );
}
