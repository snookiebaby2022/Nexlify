"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  providerType: string | null;
  description: string | null;
  maxStreams: number | null;
  notes: string | null;
  status: string;
  statusMessage: string | null;
  lastCheckAt: string | null;
  isActive: boolean;
};

const emptyForm = {
  name: "",
  baseUrl: "",
  providerType: "",
  description: "",
  maxStreams: "",
  notes: "",
};

async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    const field = data.field ? ` (${data.field})` : "";
    return data.error ? `${data.error}${field}` : `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

function Alert({ type, message, onDismiss }: { type: "error" | "success"; message: string; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm flex justify-between gap-3"
      style={{
        borderColor: type === "error" ? "var(--danger)" : "var(--success)",
        background: type === "error" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
        color: type === "error" ? "var(--danger)" : "var(--success)",
      }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button type="button" className="shrink-0 opacity-70 hover:opacity-100 cursor-pointer" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}

export default function StreamProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState(emptyForm);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stream-providers");
      if (!res.ok) {
        setLoadError(await parseApiError(res));
        return;
      }
      const d = await res.json();
      setProviders(d.providers ?? []);
      setLoadError("");
    } catch {
      setLoadError("Could not load providers — check your connection");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/stream-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          maxStreams: form.maxStreams ? Number(form.maxStreams) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(await parseApiError(res));
        return;
      }
      setForm(emptyForm);
      const probeMsg = data.probe?.message ? ` — ${data.probe.status}: ${data.probe.message}` : "";
      setFormSuccess(`Provider added${probeMsg}`);
      await load();
    } catch {
      setFormError("Network error while adding provider");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(p: Provider) {
    setEditId(p.id);
    setFormError("");
    setEdit({
      name: p.name,
      baseUrl: p.baseUrl,
      providerType: p.providerType ?? "",
      description: p.description ?? "",
      maxStreams: p.maxStreams != null ? String(p.maxStreams) : "",
      notes: p.notes ?? "",
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setFormError("");
    setFormSuccess("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/stream-providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId,
          ...edit,
          maxStreams: edit.maxStreams ? Number(edit.maxStreams) : null,
          recheck: true,
        }),
      });
      if (!res.ok) {
        setFormError(await parseApiError(res));
        return;
      }
      setEditId(null);
      setFormSuccess("Provider updated");
      await load();
    } catch {
      setFormError("Network error while saving");
    } finally {
      setSubmitting(false);
    }
  }

  async function check(id: string) {
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setCheckingId(id);
    try {
      const res = await fetch("/api/admin/stream-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check: true, id }),
      });
      if (!res.ok) {
        const msg = await parseApiError(res);
        setRowErrors((prev) => ({ ...prev, [id]: msg }));
        return;
      }
      await load();
    } catch {
      setRowErrors((prev) => ({ ...prev, [id]: "Check failed — network error" }));
    } finally {
      setCheckingId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this provider?")) return;
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const res = await fetch(`/api/admin/stream-providers?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        setFormError(await parseApiError(res));
        return;
      }
      await load();
    } catch {
      setFormError("Could not delete provider");
    }
  }

  function statusStyle(status: string) {
    if (status === "online") return { bg: "rgba(34,197,94,0.2)", color: "var(--success)" };
    if (status === "offline") return { bg: "rgba(239,68,68,0.2)", color: "var(--danger)" };
    if (status === "degraded") return { bg: "rgba(234,179,8,0.2)", color: "#ca8a04" };
    return { bg: "rgba(148,163,184,0.2)", color: "var(--muted)" };
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Content providers</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Upstream live sources and VOD hosts (generic URL, file host, Xtream VOD). Movies and episodes can reference these by path/ID.
      </p>

      <Alert type="error" message={loadError} onDismiss={() => setLoadError("")} />
      <Alert type="error" message={formError} onDismiss={() => setFormError("")} />
      <Alert type="success" message={formSuccess} onDismiss={() => setFormSuccess("")} />

      <form onSubmit={add} className="rounded-lg border p-4 grid md:grid-cols-3 gap-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <input placeholder="Name *" required className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Base URL * (http:// or https://)" required className="rounded border px-3 py-2 bg-transparent md:col-span-2" style={{ borderColor: "var(--border)" }} value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
        <select className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.providerType} onChange={(e) => setForm({ ...form, providerType: e.target.value })}>
          <option value="">Provider type</option>
          <option value="live_upstream">Live upstream</option>
          <option value="generic_url">Generic URL (VOD)</option>
          <option value="file_host">File host / CDN (VOD)</option>
          <option value="xtream_vod">Xtream VOD API</option>
        </select>
        <input placeholder="Max streams" type="number" min={0} className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.maxStreams} onChange={(e) => setForm({ ...form, maxStreams: e.target.value })} />
        <textarea placeholder="Description" className="rounded border px-3 py-2 bg-transparent md:col-span-2" style={{ borderColor: "var(--border)" }} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <textarea placeholder="Notes" className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button type="submit" disabled={submitting} className="rounded py-2 cursor-pointer md:col-span-3 disabled:opacity-50" style={{ background: "var(--accent)", color: "#fff" }}>
          {submitting ? "Adding & probing…" : "Add provider"}
        </button>
      </form>

      {editId && (
        <form onSubmit={saveEdit} className="rounded-lg border p-4 grid md:grid-cols-3 gap-3" style={{ borderColor: "var(--accent)", background: "var(--bg-card)" }}>
          <div className="md:col-span-3 text-sm font-medium">Edit provider (re-checks URL on save)</div>
          <input className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
          <input className="rounded border px-3 py-2 bg-transparent md:col-span-2" style={{ borderColor: "var(--border)" }} value={edit.baseUrl} onChange={(e) => setEdit({ ...edit, baseUrl: e.target.value })} required />
          <select className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={edit.providerType} onChange={(e) => setEdit({ ...edit, providerType: e.target.value })}>
            <option value="">Provider type</option>
            <option value="live_upstream">Live upstream</option>
            <option value="generic_url">Generic URL (VOD)</option>
            <option value="file_host">File host / CDN (VOD)</option>
            <option value="xtream_vod">Xtream VOD API</option>
          </select>
          <input type="number" min={0} placeholder="Max streams" className="rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={edit.maxStreams} onChange={(e) => setEdit({ ...edit, maxStreams: e.target.value })} />
          <textarea className="rounded border px-3 py-2 bg-transparent md:col-span-3" style={{ borderColor: "var(--border)" }} rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          <textarea className="rounded border px-3 py-2 bg-transparent md:col-span-2" style={{ borderColor: "var(--border)" }} rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="rounded px-3 py-2 cursor-pointer disabled:opacity-50" style={{ background: "var(--accent)", color: "#fff" }}>
              {submitting ? "Saving…" : "Save"}
            </button>
            <button type="button" className="rounded px-3 py-2 cursor-pointer border" style={{ borderColor: "var(--border)" }} onClick={() => setEditId(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading providers…</p>
      ) : (
        <div className="rounded-lg border overflow-auto" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--bg-card)" }}>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">URL</th>
                <th className="text-left p-3">Capacity</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Last check</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {providers.length === 0 && !loadError && (
                <tr>
                  <td colSpan={7} className="p-6 text-center" style={{ color: "var(--muted)" }}>
                    No providers yet — add one above.
                  </td>
                </tr>
              )}
              {providers.map((p) => {
                const st = statusStyle(p.status);
                return (
                  <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="p-3">
                      <button type="button" className="font-medium cursor-pointer hover:underline text-left" style={{ color: "var(--accent)" }} onClick={() => startEdit(p)}>
                        {p.name}
                      </button>
                      {p.description && <span className="block text-xs mt-1" style={{ color: "var(--muted)" }}>{p.description}</span>}
                    </td>
                    <td className="p-3" style={{ color: "var(--muted)" }}>
                      {p.providerType ?? "—"}
                    </td>
                    <td className="p-3 max-w-[12rem]">
                      <span className="block truncate" title={p.baseUrl}>{p.baseUrl}</span>
                    </td>
                    <td className="p-3">{p.maxStreams ?? "—"}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-xs capitalize" style={{ background: st.bg, color: st.color }}>
                        {p.status}
                      </span>
                      {p.statusMessage && (
                        <span className="block text-xs mt-1 max-w-[14rem]" style={{ color: "var(--muted)" }} title={p.statusMessage}>
                          {p.statusMessage}
                        </span>
                      )}
                      {rowErrors[p.id] && (
                        <span className="block text-xs mt-1" style={{ color: "var(--danger)" }}>
                          {rowErrors[p.id]}
                        </span>
                      )}
                    </td>
                    <td className="p-3" style={{ color: "var(--muted)" }}>
                      {p.lastCheckAt ? formatDateTime(p.lastCheckAt) : "Never"}
                    </td>
                    <td className="p-3 whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        disabled={checkingId === p.id}
                        className="text-xs cursor-pointer disabled:opacity-50"
                        style={{ color: "var(--accent)" }}
                        onClick={() => check(p.id)}
                      >
                        {checkingId === p.id ? "Checking…" : "Check"}
                      </button>
                      <button type="button" className="text-xs cursor-pointer" style={{ color: "var(--danger)" }} onClick={() => remove(p.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
