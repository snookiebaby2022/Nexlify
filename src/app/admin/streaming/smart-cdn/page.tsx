"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Endpoint = {
  id: string;
  name: string;
  url: string;
  priority: number;
  isActive: boolean;
  region: string;
  maxBandwidthMbps: number;
  metrics?: { score?: number; latencyMs?: number; successRate?: number } | null;
};

const emptyForm = {
  name: "",
  url: "",
  priority: 0,
  region: "global",
  maxBandwidthMbps: 1000,
  isActive: true,
};

export default function SmartCdnPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/cdn-switch")
      .then((r) => r.json())
      .then((d) => setEndpoints(d.endpoints ?? []))
      .catch(() => setEndpoints([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addEndpoint(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/cdn-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", ...form }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(typeof j.error === "string" ? j.error : "Add failed");
        return;
      }
      setForm(emptyForm);
      load();
      setMsg("CDN endpoint added — live playback will prefer the best active edge.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(ep: Endpoint) {
    await fetch("/api/admin/cdn-switch", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ep.id, isActive: !ep.isActive }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this CDN endpoint?")) return;
    await fetch(`/api/admin/cdn-switch?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  async function probeAll() {
    setBusy(true);
    setMsg("");
    try {
      await fetch("/api/admin/cdn-switch?action=probe");
      load();
      setMsg("Probe finished — scores updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Smart CDN</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Active endpoints are used to rewrite live playback URLs onto the best-scoring edge.
          Add your CDN / edge base URLs below (https://cdn.example.com).
        </p>
        <p className="text-xs mt-1">
          <Link href="/admin/settings/cdn-ips" style={{ color: "var(--accent)" }}>
            Cloudflare & Bunny IP ranges
          </Link>{" "}
          are separate (firewall allowlists).
        </p>
      </div>

      <form
        onSubmit={addEndpoint}
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="text-sm font-medium">Add endpoint</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs space-y-1">
            <span style={{ color: "var(--muted)" }}>Name</span>
            <input
              required
              className="w-full rounded border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="EU Edge 1"
            />
          </label>
          <label className="text-xs space-y-1">
            <span style={{ color: "var(--muted)" }}>Base URL</span>
            <input
              required
              className="w-full rounded border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://cdn.example.com"
            />
          </label>
          <label className="text-xs space-y-1">
            <span style={{ color: "var(--muted)" }}>Region</span>
            <input
              className="w-full rounded border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
            />
          </label>
          <label className="text-xs space-y-1">
            <span style={{ color: "var(--muted)" }}>Priority (lower = preferred when scores tie)</span>
            <input
              type="number"
              className="w-full rounded border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded px-3 py-2 text-sm text-white cursor-pointer disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            Add CDN
          </button>
          <button
            type="button"
            disabled={busy || endpoints.length === 0}
            onClick={() => void probeAll()}
            className="rounded border px-3 py-2 text-sm cursor-pointer disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            Probe all
          </button>
        </div>
        {msg && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {msg}
          </p>
        )}
      </form>

      <div className="rounded-lg border divide-y" style={{ borderColor: "var(--border)" }}>
        {loading && (
          <div className="px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>
            Loading…
          </div>
        )}
        {!loading && endpoints.length === 0 && (
          <div className="px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>
            No CDN endpoints yet — playback uses origin URLs until you add one.
          </div>
        )}
        {endpoints.map((ep) => (
          <div key={ep.id} className="px-4 py-3 flex flex-wrap gap-3 items-center text-sm">
            <div className="flex-1 min-w-[12rem]">
              <div className="font-medium">
                {ep.name}{" "}
                <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>
                  {ep.region} · p{ep.priority}
                </span>
              </div>
              <div className="text-xs truncate" style={{ color: "var(--muted)" }}>
                {ep.url}
              </div>
              {ep.metrics && (
                <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  Score {ep.metrics.score ?? "—"}
                  {ep.metrics.latencyMs != null ? ` · ${ep.metrics.latencyMs}ms` : ""}
                </div>
              )}
            </div>
            <button
              type="button"
              className="text-xs rounded border px-2 py-1 cursor-pointer"
              style={{ borderColor: "var(--border)" }}
              onClick={() => void toggleActive(ep)}
            >
              {ep.isActive ? "Active" : "Off"}
            </button>
            <button
              type="button"
              className="text-xs underline cursor-pointer"
              style={{ color: "var(--danger, #dc2626)" }}
              onClick={() => void remove(ep.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
