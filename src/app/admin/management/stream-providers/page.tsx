"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { formatDateTime } from "@/lib/format";
import { inferRemoteConnectionFromUrl } from "@/lib/stream-provider-probe";

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
  remoteExpiresAt: string | null;
  remoteMaxConnections: number | null;
  remoteUpstreamConnections: number | null;
  panelConnectionCount?: number;
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
  maxStreams: "",
  notes: "",
  remoteUsername: "",
  remotePassword: "",
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

function RemoteAutoPreview({ baseUrl }: { baseUrl: string }) {
  const remote = useMemo(() => inferRemoteConnectionFromUrl(baseUrl), [baseUrl]);
  if (!baseUrl.trim()) {
    return (
      <p className="text-xs md:col-span-3" style={{ color: "var(--muted)" }}>
        Host, port, and panel URL are detected from the base URL when you add or press Check.
      </p>
    );
  }
  if (!remote.remoteHost) {
    return (
      <p className="text-xs md:col-span-3" style={{ color: "var(--muted)" }}>
        Enter a valid base URL to preview detected remote connection info.
      </p>
    );
  }
  const hostLine = remote.remotePort ? `${remote.remoteHost}:${remote.remotePort}` : remote.remoteHost;
  return (
    <div
      className="md:col-span-3 rounded border px-3 py-2 text-xs space-y-1"
      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
    >
      <div className="font-medium" style={{ color: "var(--text)" }}>
        Auto-detected remote connection
      </div>
      <div>
        {remote.remoteProtocol?.toUpperCase() ?? "—"} · {hostLine}
      </div>
      {remote.remotePanelUrl && <div>Panel: {remote.remotePanelUrl}</div>}
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
      <RemoteAutoPreview baseUrl={value.baseUrl} />
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
    apiKey: form.apiKey || null,
    remoteUsername: form.remoteUsername || null,
    remotePassword: form.remotePassword || null,
    remoteNotes: form.remoteNotes || null,
  };
}

function providerToForm(p: Provider): typeof emptyForm {
  return {
    name: p.name,
    baseUrl: p.baseUrl,
    apiKey: p.apiKey ?? "",
    providerType: p.providerType ?? "",
    maxStreams: p.maxStreams != null ? String(p.maxStreams) : "",
    notes: p.notes ?? "",
    remoteUsername: p.remoteUsername ?? "",
    remotePassword: p.remotePassword ?? "",
    remoteNotes: p.remoteNotes ?? "",
  };
}

function effectiveRemote(p: Provider) {
  const inferred = inferRemoteConnectionFromUrl(p.baseUrl);
  return {
    host: p.remoteHost || inferred.remoteHost,
    port: p.remotePort ?? inferred.remotePort,
    protocol: p.remoteProtocol || inferred.remoteProtocol,
    panelUrl: p.remotePanelUrl || inferred.remotePanelUrl,
    username: p.remoteUsername,
    password: p.remotePassword,
    notes: p.remoteNotes,
  };
}

function remoteDisplay(p: Provider): { primary: string; secondary?: string; stats?: string; title: string } {
  const r = effectiveRemote(p);
  if (!r.host) {
    return { primary: "—", title: "Could not parse host from base URL" };
  }
  const primaryParts: string[] = [];
  if (r.protocol) primaryParts.push(r.protocol.toUpperCase());
  primaryParts.push(r.port ? `${r.host}:${r.port}` : r.host);
  if (r.username) primaryParts.push(`user ${r.username}`);
  const primary = primaryParts.join(" · ");
  const secondary = r.panelUrl && r.panelUrl !== `http://${r.host}` && r.panelUrl !== `https://${r.host}`
    ? r.panelUrl
    : r.panelUrl || undefined;

  const statParts: string[] = [];
  if (p.remoteExpiresAt) {
    statParts.push(`Expires ${formatDateTime(p.remoteExpiresAt)}`);
  }
  const panelConns = p.panelConnectionCount ?? 0;
  statParts.push(`Panel ${panelConns} conn${panelConns === 1 ? "" : "s"}`);
  if (p.remoteUpstreamConnections != null) {
    const max = p.remoteMaxConnections != null ? `/${p.remoteMaxConnections}` : "";
    statParts.push(`Provider ${p.remoteUpstreamConnections}${max} conn${p.remoteUpstreamConnections === 1 ? "" : "s"}`);
  } else if (p.remoteMaxConnections != null) {
    statParts.push(`Max ${p.remoteMaxConnections}`);
  }

  return {
    primary,
    secondary: secondary && secondary !== primary ? secondary : undefined,
    stats: statParts.length ? statParts.join(" · ") : undefined,
    title: [primary, secondary, statParts.join(" · "), r.notes].filter(Boolean).join("\n"),
  };
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
      const data = await res.json();
      const p = data.provider as Provider | undefined;
      if (p) {
        const remote = remoteDisplay(p);
        setFormSuccess(`Checked — ${remote.primary}${remote.secondary ? ` · ${remote.secondary}` : ""}`);
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
            <strong>Remote connection</strong> — Host, port, and panel URL are auto-detected from the base URL. Add optional credentials and notes for ops access.
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
          <div className="md:col-span-3 text-sm font-medium">Edit provider (re-checks URL and remote info on save)</div>
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
                      <td className="p-3 max-w-[16rem]">
                        {(() => {
                          const remote = remoteDisplay(p);
                          return (
                            <>
                              <span className="block text-xs font-medium truncate" style={{ color: "var(--text)" }} title={remote.title}>
                                {remote.primary}
                              </span>
                              {remote.secondary && (
                                <span className="block text-[11px] mt-0.5 truncate" style={{ color: "var(--accent)" }} title={remote.secondary}>
                                  {remote.secondary}
                                </span>
                              )}
                              {remote.stats && (
                                <span className="block text-[11px] mt-0.5 truncate" style={{ color: "var(--muted)" }} title={remote.stats}>
                                  {remote.stats}
                                </span>
                              )}
                            </>
                          );
                        })()}
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
                          {(() => {
                            const r = effectiveRemote(p);
                            return (
                              <>
                                {r.panelUrl && (
                                  <div>
                                    <strong style={{ color: "var(--text)" }}>Panel:</strong>{" "}
                                    <a href={r.panelUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent)" }}>
                                      {r.panelUrl}
                                    </a>
                                  </div>
                                )}
                                {r.host && (
                                  <div>
                                    <strong style={{ color: "var(--text)" }}>Remote:</strong>{" "}
                                    {r.username ? `${r.username}@` : ""}
                                    {r.host}
                                    {r.port ? `:${r.port}` : ""}
                                    {r.protocol ? ` (${r.protocol})` : ""}
                                  </div>
                                )}
                              </>
                            );
                          })()}
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
