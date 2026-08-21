"use client";

import { useCallback, useEffect, useState, Fragment } from "react";
import { formatDateTime } from "@/lib/format";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string | null;
  providerType: string | null;
  description: string | null;
  contactEmail: string | null;
  region: string | null;
  maxStreams: number | null;
  notes: string | null;
  remotePanelUrl: string | null;
  remoteHost: string | null;
  remotePort: number | null;
  remoteUsername: string | null;
  remotePassword: string | null;
  remoteProtocol: string | null;
  remoteNotes: string | null;
  status: string;
  statusMessage: string | null;
  lastCheckAt: string | null;
  lastLatencyMs: number | null;
  isActive: boolean;
  _count?: { streams: number; m3uSyncJobs: number };
};

const emptyForm = {
  name: "",
  baseUrl: "",
  apiKey: "",
  providerType: "",
  description: "",
  contactEmail: "",
  region: "",
  maxStreams: "",
  notes: "",
  remotePanelUrl: "",
  remoteHost: "",
  remotePort: "",
  remoteUsername: "",
  remotePassword: "",
  remoteProtocol: "ssh",
  remoteNotes: "",
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

function ProviderFields({
  value,
  onChange,
}: {
  value: typeof emptyForm;
  onChange: (next: typeof emptyForm) => void;
}) {
  const set = (k: keyof typeof emptyForm, v: string) => onChange({ ...value, [k]: v });
  return (
    <>
      <input
        placeholder="Name *"
        required
        className="rounded border px-3 py-2 bg-transparent"
        style={{ borderColor: "var(--border)" }}
        value={value.name}
        onChange={(e) => set("name", e.target.value)}
      />
      <input
        placeholder="Base URL * (http:// or https://)"
        required
        className="rounded border px-3 py-2 bg-transparent md:col-span-2"
        style={{ borderColor: "var(--border)" }}
        value={value.baseUrl}
        onChange={(e) => set("baseUrl", e.target.value)}
      />
      <select
        className="rounded border px-3 py-2 bg-transparent"
        style={{ borderColor: "var(--border)" }}
        value={value.providerType}
        onChange={(e) => set("providerType", e.target.value)}
      >
        <option value="">Provider type</option>
        <option value="live_upstream">Live upstream</option>
        <option value="generic_url">Generic URL (VOD)</option>
        <option value="file_host">File host / CDN (VOD)</option>
        <option value="xtream_vod">Xtream VOD API</option>
      </select>
      <input
        placeholder="API key / token (optional)"
        className="rounded border px-3 py-2 bg-transparent"
        style={{ borderColor: "var(--border)" }}
        value={value.apiKey}
        onChange={(e) => set("apiKey", e.target.value)}
      />
      <input
        placeholder="Max streams"
        type="number"
        min={0}
        className="rounded border px-3 py-2 bg-transparent"
        style={{ borderColor: "var(--border)" }}
        value={value.maxStreams}
        onChange={(e) => set("maxStreams", e.target.value)}
      />
      <input
        placeholder="Contact email"
        type="email"
        className="rounded border px-3 py-2 bg-transparent"
        style={{ borderColor: "var(--border)" }}
        value={value.contactEmail}
        onChange={(e) => set("contactEmail", e.target.value)}
      />
      <input
        placeholder="Region (e.g. EU, US-East)"
        className="rounded border px-3 py-2 bg-transparent"
        style={{ borderColor: "var(--border)" }}
        value={value.region}
        onChange={(e) => set("region", e.target.value)}
      />
      <textarea
        placeholder="Description"
        className="rounded border px-3 py-2 bg-transparent md:col-span-3"
        style={{ borderColor: "var(--border)" }}
        rows={2}
        value={value.description}
        onChange={(e) => set("description", e.target.value)}
      />
      <textarea
        placeholder="Notes"
        className="rounded border px-3 py-2 bg-transparent md:col-span-3"
        style={{ borderColor: "var(--border)" }}
        rows={2}
        value={value.notes}
        onChange={(e) => set("notes", e.target.value)}
      />

      <div className="md:col-span-3 pt-2 border-t text-sm font-medium" style={{ borderColor: "var(--border)", color: "var(--accent)" }}>
        Remote connection info
      </div>
      <input
        placeholder="Remote panel URL"
        className="rounded border px-3 py-2 bg-transparent md:col-span-2"
        style={{ borderColor: "var(--border)" }}
        value={value.remotePanelUrl}
        onChange={(e) => set("remotePanelUrl", e.target.value)}
      />
      <select
        className="rounded border px-3 py-2 bg-transparent"
        style={{ borderColor: "var(--border)" }}
        value={value.remoteProtocol}
        onChange={(e) => set("remoteProtocol", e.target.value)}
      >
        <option value="ssh">SSH</option>
        <option value="https">HTTPS panel</option>
        <option value="http">HTTP panel</option>
        <option value="rdp">RDP</option>
        <option value="other">Other</option>
      </select>
      <input
        placeholder="Remote host / IP"
        className="rounded border px-3 py-2 bg-transparent"
        style={{ borderColor: "var(--border)" }}
        value={value.remoteHost}
        onChange={(e) => set("remoteHost", e.target.value)}
      />
      <input
        placeholder="Port (22, 443…)"
        type="number"
        min={1}
        max={65535}
        className="rounded border px-3 py-2 bg-transparent"
        style={{ borderColor: "var(--border)" }}
        value={value.remotePort}
        onChange={(e) => set("remotePort", e.target.value)}
      />
      <input
        placeholder="Remote username"
        className="rounded border px-3 py-2 bg-transparent"
        style={{ borderColor: "var(--border)" }}
        value={value.remoteUsername}
        onChange={(e) => set("remoteUsername", e.target.value)}
      />
      <input
        placeholder="Remote password"
        type="password"
        autoComplete="new-password"
        className="rounded border px-3 py-2 bg-transparent md:col-span-2"
        style={{ borderColor: "var(--border)" }}
        value={value.remotePassword}
        onChange={(e) => set("remotePassword", e.target.value)}
      />
      <textarea
        placeholder="Remote notes (VPN, jump host, support ticket…)"
        className="rounded border px-3 py-2 bg-transparent md:col-span-3"
        style={{ borderColor: "var(--border)" }}
        rows={2}
        value={value.remoteNotes}
        onChange={(e) => set("remoteNotes", e.target.value)}
      />
    </>
  );
}

function formPayload(form: typeof emptyForm) {
  return {
    ...form,
    maxStreams: form.maxStreams ? Number(form.maxStreams) : null,
    remotePort: form.remotePort ? Number(form.remotePort) : null,
    apiKey: form.apiKey || null,
    contactEmail: form.contactEmail || null,
    region: form.region || null,
    remotePanelUrl: form.remotePanelUrl || null,
    remoteHost: form.remoteHost || null,
    remoteUsername: form.remoteUsername || null,
    remotePassword: form.remotePassword || null,
    remoteProtocol: form.remoteProtocol || null,
    remoteNotes: form.remoteNotes || null,
  };
}

function providerToForm(p: Provider): typeof emptyForm {
  return {
    name: p.name,
    baseUrl: p.baseUrl,
    apiKey: p.apiKey ?? "",
    providerType: p.providerType ?? "",
    description: p.description ?? "",
    contactEmail: p.contactEmail ?? "",
    region: p.region ?? "",
    maxStreams: p.maxStreams != null ? String(p.maxStreams) : "",
    notes: p.notes ?? "",
    remotePanelUrl: p.remotePanelUrl ?? "",
    remoteHost: p.remoteHost ?? "",
    remotePort: p.remotePort != null ? String(p.remotePort) : "",
    remoteUsername: p.remoteUsername ?? "",
    remotePassword: p.remotePassword ?? "",
    remoteProtocol: p.remoteProtocol ?? "ssh",
    remoteNotes: p.remoteNotes ?? "",
  };
}

function remoteSummary(p: Provider): string {
  const parts: string[] = [];
  if (p.remoteProtocol) parts.push(p.remoteProtocol.toUpperCase());
  if (p.remoteHost) {
    parts.push(p.remotePort ? `${p.remoteHost}:${p.remotePort}` : p.remoteHost);
  }
  if (p.remoteUsername) parts.push(`user=${p.remoteUsername}`);
  if (p.remotePanelUrl) parts.push(p.remotePanelUrl);
  return parts.join(" · ") || "—";
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        body: JSON.stringify(formPayload(form)),
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
    setEdit(providerToForm(p));
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
          ...formPayload(edit),
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

  async function toggleActive(p: Provider) {
    try {
      const res = await fetch("/api/admin/stream-providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
          maxStreams: p.maxStreams,
          contactEmail: p.contactEmail,
          isActive: !p.isActive,
        }),
      });
      if (!res.ok) {
        setFormError(await parseApiError(res));
        return;
      }
      await load();
    } catch {
      setFormError("Could not update active state");
    }
  }

  async function duplicate(p: Provider) {
    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch("/api/admin/stream-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formPayload(providerToForm(p)),
          name: `${p.name} (copy)`,
        }),
      });
      if (!res.ok) {
        setFormError(await parseApiError(res));
        return;
      }
      setFormSuccess("Provider duplicated");
      await load();
    } catch {
      setFormError("Could not duplicate provider");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyRemote(p: Provider) {
    const text = [
      `Provider: ${p.name}`,
      `Stream URL: ${p.baseUrl}`,
      p.remotePanelUrl ? `Panel: ${p.remotePanelUrl}` : null,
      p.remoteHost
        ? `Host: ${p.remoteHost}${p.remotePort ? `:${p.remotePort}` : ""} (${p.remoteProtocol || "ssh"})`
        : null,
      p.remoteUsername ? `User: ${p.remoteUsername}` : null,
      p.remotePassword ? `Pass: ${p.remotePassword}` : null,
      p.remoteNotes ? `Notes: ${p.remoteNotes}` : null,
      p.contactEmail ? `Email: ${p.contactEmail}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const ok = await copyToClipboard(text);
    setFormSuccess(ok ? "Remote connection info copied" : "Could not copy");
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
      <h1 className="text-2xl font-semibold">Providers</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        IPTV upstream sources and VOD hosts, plus remote connection details for SSH / panel access.
      </p>

      <div
        className="rounded-lg border p-4 text-sm space-y-3"
        style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}
      >
        <h3 className="font-semibold" style={{ color: "var(--accent)" }}>
          What are providers?
        </h3>
        <div className="space-y-2 text-[var(--muted)]">
          <p>
            <strong>Live upstream</strong> — A server that provides live TV streams.
          </p>
          <p>
            <strong>Generic URL / File host / Xtream VOD</strong> — Movie and series sources.
          </p>
          <p>
            <strong>Remote connection</strong> — Store SSH/panel host, port, credentials, and notes so ops can reach the provider box quickly.
          </p>
        </div>
      </div>

      <Alert type="error" message={loadError} onDismiss={() => setLoadError("")} />
      <Alert type="error" message={formError} onDismiss={() => setFormError("")} />
      <Alert type="success" message={formSuccess} onDismiss={() => setFormSuccess("")} />

      <form
        onSubmit={add}
        className="rounded-lg border p-4 grid md:grid-cols-3 gap-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <ProviderFields value={form} onChange={setForm} />
        <button
          type="submit"
          disabled={submitting}
          className="rounded py-2 cursor-pointer md:col-span-3 disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {submitting ? "Adding & probing…" : "Add provider"}
        </button>
      </form>

      {editId && (
        <form
          onSubmit={saveEdit}
          className="rounded-lg border p-4 grid md:grid-cols-3 gap-3"
          style={{ borderColor: "var(--accent)", background: "var(--bg-card)" }}
        >
          <div className="md:col-span-3 text-sm font-medium">Edit provider (re-checks URL on save)</div>
          <ProviderFields value={edit} onChange={setEdit} />
          <div className="flex gap-2 md:col-span-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded px-3 py-2 cursor-pointer disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {submitting ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="rounded px-3 py-2 cursor-pointer border"
              style={{ borderColor: "var(--border)" }}
              onClick={() => setEditId(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Loading providers…
        </p>
      ) : (
        <div className="rounded-lg border overflow-auto" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--bg-card)" }}>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Streams</th>
                <th className="text-left p-3">Remote</th>
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
                const open = expandedId === p.id;
                return (
                  <Fragment key={p.id}>
                    <tr className="border-t" style={{ borderColor: "var(--border)", opacity: p.isActive ? 1 : 0.55 }}>
                      <td className="p-3">
                        <button
                          type="button"
                          className="font-medium cursor-pointer hover:underline text-left"
                          style={{ color: "var(--accent)" }}
                          onClick={() => startEdit(p)}
                        >
                          {p.name}
                        </button>
                        {!p.isActive && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                            inactive
                          </span>
                        )}
                        {p.description && (
                          <span className="block text-xs mt-1" style={{ color: "var(--muted)" }}>
                            {p.description}
                          </span>
                        )}
                        <button
                          type="button"
                          className="mt-1 text-[11px] underline cursor-pointer"
                          style={{ color: "var(--muted)" }}
                          onClick={() => setExpandedId(open ? null : p.id)}
                        >
                          {open ? "Hide details" : "Show URL & remote"}
                        </button>
                      </td>
                      <td className="p-3" style={{ color: "var(--muted)" }}>
                        {p.providerType ?? "—"}
                        {p.region ? <span className="block text-xs">{p.region}</span> : null}
                      </td>
                      <td className="p-3">
                        {p._count?.streams ?? 0}
                        {(p._count?.m3uSyncJobs ?? 0) > 0 && (
                          <span className="block text-xs" style={{ color: "var(--muted)" }}>
                            {p._count!.m3uSyncJobs} sync job(s)
                          </span>
                        )}
                        {p.maxStreams != null && (
                          <span className="block text-xs" style={{ color: "var(--muted)" }}>
                            cap {p.maxStreams}
                          </span>
                        )}
                      </td>
                      <td className="p-3 max-w-[14rem]">
                        <span className="block truncate text-xs" title={remoteSummary(p)}>
                          {remoteSummary(p)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-xs capitalize" style={{ background: st.bg, color: st.color }}>
                          {p.status}
                        </span>
                        {p.lastLatencyMs != null && (
                          <span className="block text-xs mt-1" style={{ color: "var(--muted)" }}>
                            {p.lastLatencyMs} ms
                          </span>
                        )}
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
                        <button type="button" className="text-xs cursor-pointer" style={{ color: "var(--accent)" }} onClick={() => void toggleActive(p)}>
                          {p.isActive ? "Disable" : "Enable"}
                        </button>
                        <button type="button" className="text-xs cursor-pointer" style={{ color: "var(--accent)" }} onClick={() => void duplicate(p)}>
                          Duplicate
                        </button>
                        <button type="button" className="text-xs cursor-pointer" style={{ color: "var(--accent)" }} onClick={() => void copyRemote(p)}>
                          Copy remote
                        </button>
                        <button type="button" className="text-xs cursor-pointer" style={{ color: "var(--danger)" }} onClick={() => remove(p.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.12)" }}>
                        <td colSpan={7} className="p-3 text-xs space-y-1" style={{ color: "var(--muted)" }}>
                          <div>
                            <strong style={{ color: "var(--text)" }}>URL:</strong> {p.baseUrl}
                          </div>
                          {p.contactEmail && (
                            <div>
                              <strong style={{ color: "var(--text)" }}>Email:</strong> {p.contactEmail}
                            </div>
                          )}
                          {p.remotePanelUrl && (
                            <div>
                              <strong style={{ color: "var(--text)" }}>Panel:</strong>{" "}
                              <a href={p.remotePanelUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent)" }}>
                                {p.remotePanelUrl}
                              </a>
                            </div>
                          )}
                          {(p.remoteHost || p.remoteUsername) && (
                            <div>
                              <strong style={{ color: "var(--text)" }}>SSH/Remote:</strong>{" "}
                              {p.remoteUsername ? `${p.remoteUsername}@` : ""}
                              {p.remoteHost || "—"}
                              {p.remotePort ? `:${p.remotePort}` : ""}
                            </div>
                          )}
                          {p.remoteNotes && (
                            <div>
                              <strong style={{ color: "var(--text)" }}>Remote notes:</strong> {p.remoteNotes}
                            </div>
                          )}
                          {p.notes && (
                            <div>
                              <strong style={{ color: "var(--text)" }}>Notes:</strong> {p.notes}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
