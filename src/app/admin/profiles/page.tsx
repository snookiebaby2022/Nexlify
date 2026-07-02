"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

type ProfileRow = {
  id: string;
  type: "device" | "mag" | "enigma";
  identifier: string;
  deviceName: string | null;
  deviceType: string | null;
  lineUsername: string | null;
  ip: string | null;
  userAgent: string | null;
  status: string;
  lastSeenAt: string;
  createdAt: string;
};

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "device" | "mag" | "enigma">("all");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (q.trim()) params.set("q", q.trim());
    if (filter !== "all") params.set("type", filter);
    fetch(`/api/admin/profiles?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setProfiles(d.profiles ?? []);
        setLoading(false);
      });
  }, [q, filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Device Profiles</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Stalker, MAG, Enigma, and bound device profiles. Unified view of all registered devices.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="flex gap-1">
          {(["all", "device", "mag", "enigma"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className="px-3 py-1.5 rounded text-sm cursor-pointer border"
              style={{
                background: filter === t ? "var(--accent)" : "transparent",
                color: filter === t ? "#fff" : "var(--text)",
                borderColor: "var(--border)",
              }}
              onClick={() => setFilter(t)}
            >
              {t === "all" ? "All" : t === "device" ? "Bound Devices" : t.toUpperCase()}
            </button>
          ))}
        </div>
        <input
          className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[200px]"
          style={{ borderColor: "var(--border)" }}
          placeholder="Search MAC, device name, line..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button
          type="button"
          onClick={load}
          className="rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Search
        </button>
      </div>

      <div className="rounded-lg border overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Identifier</th>
              <th className="p-3 font-medium">Device</th>
              <th className="p-3 font-medium">Line</th>
              <th className="p-3 font-medium">IP</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Last Seen</th>
              <th className="p-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  Loading...
                </td>
              </tr>
            )}
            {!loading && profiles.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center" style={{ color: "var(--muted)" }}>
                  No profiles found.
                </td>
              </tr>
            )}
            {!loading &&
              profiles.map((p) => (
                <tr key={p.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{
                      background: p.type === "mag" ? "rgba(59,130,246,0.15)" : p.type === "enigma" ? "rgba(168,85,247,0.15)" : "rgba(34,197,94,0.15)",
                      color: p.type === "mag" ? "#3b82f6" : p.type === "enigma" ? "#a855f7" : "#22c55e",
                    }}>
                      {p.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs">{p.identifier}</td>
                  <td className="p-3">{p.deviceName ?? p.deviceType ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{p.lineUsername ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{p.ip ?? "—"}</td>
                  <td className="p-3">
                    <span className={`xui-pill xui-pill--${p.status === "active" || p.status === "ACTIVE" ? "yes" : "no"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {formatDateTime(p.lastSeenAt)}
                  </td>
                  <td className="p-3 whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {formatDateTime(p.createdAt)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
