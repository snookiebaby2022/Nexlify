"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { AccessOutputCheckboxes } from "@/components/access-output-checkboxes";
import {
  defaultAccessOutputSelection,
  parseAccessOutput,
  serializeAccessOutput,
  type AccessOutputId,
} from "@/lib/line-access-output";
import { BouquetPickerTable, type BouquetPickerRow } from "@/components/bouquet-picker-table";
import { PasswordInput } from "@/components/password-input";
import { CopyableCredential } from "@/components/copyable-credential";
import { FormField, formInputClass, formInputStyle, formSelectClass } from "@/components/form-page-shell";
import { generateLinePassword, MIN_LINE_CREDENTIAL_LENGTH, sanitizeCredentialInput } from "@/lib/credential-generate";
import { formatDateTime, isUnlimitedLineExpiry } from "@/lib/format";
import { lineDurationPresetsForPanel } from "@/lib/line-duration-presets";
import { expiryFromDays, toDatetimeLocalValue } from "@/lib/datetime-local";
import { bouquetsApiRoot, linesApiRoot } from "@/lib/panel-api";

type LineDetail = {
  id: string;
  username: string;
  password: string;
  status: string;
  maxConnections: number;
  expiresAt: string;
  externalId?: string | null;
  notes?: string | null;
  lockToIp: boolean;
  allowedIps?: string | null;
  allowedCountries?: string | null;
  blockedCountries?: string | null;
  blockedIsps?: string | null;
  allowedUserAgents?: string | null;
  isRestreamer: boolean;
  isTrial: boolean;
  forcedServerId?: string | null;
  allowedOutput?: string | null;
  owner?: { id: string; username: string } | null;
  bouquets: { bouquet: { id: string; name: string } }[];
};

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="text-sm">
      <div className="mb-1.5 font-medium">{label}</div>
      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={value} onChange={() => onChange(true)} />
          Yes
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={!value} onChange={() => onChange(false)} />
          No
        </label>
      </div>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border p-4 space-y-4"
      style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.15)" }}
    >
      {title && (
        <h3 className="text-sm font-semibold" style={{ color: "#00c0ef" }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

function splitNotes(notes: string | null | undefined) {
  if (!notes?.trim()) return { admin: "", reseller: "" };
  const parts = notes.split("\n---\n");
  return { admin: parts[0]?.trim() ?? "", reseller: parts[1]?.trim() ?? "" };
}

export function LineEditForm({
  lineId,
  panel = "admin",
  onClose,
  onSaved,
}: {
  lineId: string;
  panel?: "admin" | "reseller";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"details" | "restrictions" | "bouquets">("details");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [line, setLine] = useState<LineDetail | null>(null);
  const [bouquets, setBouquets] = useState<BouquetPickerRow[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [owners, setOwners] = useState<{ id: string; username: string }[]>([]);
  const [allowTrials, setAllowTrials] = useState(true);
  const [form, setForm] = useState({
    password: "",
    maxConnections: 1,
    extendDays: 0,
    unlimited: false,
    expiresAtLocal: "",
    ownerId: "",
    externalId: "",
    bouquetIds: [] as string[],
    lockToIp: false,
    allowedIps: "",
    allowedCountries: "",
    blockedCountries: "",
    blockedIsps: "",
    allowedUserAgents: "",
    isEnabled: true,
    isTrial: false,
    isRestreamer: false,
    forcedServerId: "",
    adminNotes: "",
    resellerNotes: "",
    accessOutputs: defaultAccessOutputSelection(),
  });

  useEffect(() => {
    setLoading(true);
    const linesApi = linesApiRoot(panel);
    const bouquetApi = bouquetsApiRoot(panel);
    const tasks: Promise<Record<string, unknown>>[] = [
      fetch(`${linesApi}/${lineId}`).then((r) => r.json()),
      fetch(bouquetApi).then((r) => r.json()),
    ];
    if (panel === "admin") {
      tasks.push(fetch("/api/admin/servers").then((r) => r.json()));
      tasks.push(fetch("/api/admin/resellers").then((r) => r.json()));
    }
    fetch("/api/admin/settings?group=general")
      .then((r) => r.json())
      .then((d) => setAllowTrials(d.settings?.disableTrial !== true))
      .catch(() => {});
    Promise.all(tasks)
      .then(([lineRes, bouquetRes, serverRes, resellerRes]) => {
        const row = (lineRes as { line?: LineDetail }).line;
        if (!row) return;
        setLine(row);
        const notes = splitNotes(row.notes);
        const unlimited = isUnlimitedLineExpiry(row.expiresAt);
        setForm({
          password: row.password,
          maxConnections: row.maxConnections,
          extendDays: 0,
          unlimited,
          expiresAtLocal: unlimited
            ? panel === "admin"
              ? toDatetimeLocalValue(expiryFromDays(30))
              : ""
            : toDatetimeLocalValue(new Date(row.expiresAt)),
          ownerId: row.owner?.id ?? "",
          externalId: row.externalId ?? "",
          bouquetIds: row.bouquets.map((b) => b.bouquet.id),
          lockToIp: row.lockToIp,
          allowedIps: row.allowedIps ?? "",
          allowedCountries: row.allowedCountries ?? "",
          blockedCountries: row.blockedCountries ?? "",
          blockedIsps: row.blockedIsps ?? "",
          allowedUserAgents: row.allowedUserAgents ?? "",
          isEnabled: row.status === "ACTIVE",
          isTrial: row.isTrial,
          isRestreamer: row.isRestreamer,
          forcedServerId: row.forcedServerId ?? "",
          adminNotes: notes.admin,
          resellerNotes: notes.reseller,
          accessOutputs: (() => {
            const selected = parseAccessOutput(row.allowedOutput);
            return selected.size ? selected : defaultAccessOutputSelection();
          })(),
        });
        setBouquets((bouquetRes as { bouquets?: { id: string; name: string }[] }).bouquets ?? []);
        setServers(
          ((serverRes as { servers?: { id: string; name: string }[] } | undefined)?.servers ?? []).map((s) => ({
            id: s.id,
            name: s.name,
          }))
        );
        setOwners(
          ((resellerRes as { users?: { id: string; username: string; role: string }[]; resellers?: { id: string; username: string; role: string }[] } | undefined)
            ?.users ??
            (resellerRes as { resellers?: { id: string; username: string; role: string }[] } | undefined)?.resellers ??
            [])
            .filter((u) => u.role === "RESELLER" || u.role === "SUB_RESELLER")
            .map((u) => ({ id: u.id, username: u.username }))
        );
      })
      .finally(() => setLoading(false));
  }, [lineId, panel]);

  async function setStatus(status: string) {
    await fetch(`${linesApiRoot(panel)}/${lineId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!line) return;
    if (form.password.length > 0) {
      const nextPass = sanitizeCredentialInput(form.password);
      if (nextPass.length < MIN_LINE_CREDENTIAL_LENGTH) {
        alert(`Password must be at least ${MIN_LINE_CREDENTIAL_LENGTH} characters.`);
        return;
      }
    }

    const canUnlimited = panel === "admin";
    const unlimited = canUnlimited && form.unlimited;
    if (!allowTrials && form.isTrial && !line.isTrial) {
      alert("Trial subscriptions (24 hours / 48 hours) are disabled.");
      return;
    }
    let expiresAt: string | undefined;
    if (!unlimited && form.extendDays <= 0 && form.expiresAtLocal) {
      const parsed = new Date(form.expiresAtLocal);
      if (Number.isNaN(parsed.getTime())) {
        alert("Invalid expiry date");
        return;
      }
      expiresAt = parsed.toISOString();
    }

    setSaving(true);
    const targetStatus = form.isEnabled ? "ACTIVE" : "DISABLED";
    if (targetStatus !== line.status && line.status !== "BANNED") {
      await setStatus(targetStatus);
    }

    const notes = [form.adminNotes, form.resellerNotes].filter(Boolean).join("\n---\n");
    const res = await fetch(`${linesApiRoot(panel)}/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: form.password !== line.password ? sanitizeCredentialInput(form.password) : undefined,
        maxConnections: form.maxConnections,
        days: unlimited || expiresAt ? undefined : form.extendDays > 0 ? form.extendDays : undefined,
        unlimited: unlimited ? true : undefined,
        expiresAt,
        ownerId: panel === "admin" ? form.ownerId || null : undefined,
        externalId: form.externalId || null,
        bouquetIds: form.bouquetIds,
        lockToIp: form.lockToIp,
        allowedIps: form.allowedIps || null,
        allowedCountries: form.allowedCountries || null,
        blockedCountries: form.blockedCountries || null,
        blockedIsps: form.blockedIsps || null,
        allowedUserAgents: form.allowedUserAgents || null,
        isRestreamer: form.isRestreamer,
        isTrial: form.isTrial,
        forcedServerId: form.forcedServerId || null,
        notes: notes || null,
        allowedOutput: serializeAccessOutput(form.accessOutputs),
      }),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "Failed to save line");
      return;
    }
    if (data.line) {
      setLine(data.line);
      setForm((f) => {
        const nextUnlimited = isUnlimitedLineExpiry(data.line.expiresAt);
        return {
          ...f,
          extendDays: 0,
          unlimited: nextUnlimited,
          expiresAtLocal: nextUnlimited
            ? panel === "admin"
              ? toDatetimeLocalValue(expiryFromDays(30))
              : ""
            : toDatetimeLocalValue(new Date(data.line.expiresAt)),
          ownerId: data.line.owner?.id ?? f.ownerId,
        };
      });
    }
    onSaved();
  }

  async function banLine() {
    if (!confirm(`Ban line ${line?.username}?`)) return;
    await setStatus("BANNED");
    onSaved();
  }

  async function deleteLine() {
    if (!confirm(`Delete line ${line?.username}? This cannot be undone.`)) return;
    await fetch(`${linesApiRoot(panel)}/${lineId}`, { method: "DELETE" });
    onSaved();
  }

  if (loading || !line) {
    return (
      <div className="p-8 text-center text-sm" style={{ color: "var(--muted)" }}>
        Loading line…
      </div>
    );
  }

  const statusLabel =
    line.status === "ACTIVE" ? "Active" : line.status === "BANNED" ? "Banned" : "Disabled";

  return (
    <form onSubmit={submit} className="panel-form-mobile-tight">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 rounded-t-lg"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <div>
          <p className="text-xs text-white/80">Subscriptions · Edit line</p>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 flex-wrap">
            {line.username}
            <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-white/20">{statusLabel}</span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {line.status !== "BANNED" && (
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded border border-white/60 text-white hover:bg-white/10 cursor-pointer"
              onClick={() => void banLine()}
            >
              Ban
            </button>
          )}
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded border border-red-300/80 text-white hover:bg-red-500/20 cursor-pointer"
            onClick={() => void deleteLine()}
          >
            Delete
          </button>
          <button
            type="button"
            className="text-sm p-1.5 rounded text-white hover:bg-white/10 cursor-pointer"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div
        className="rounded-b-lg border border-t-0 p-5 md:p-6 space-y-5"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="flex flex-wrap gap-2">
          {lineDurationPresetsForPanel(panel, { allowTrials }).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                setForm((f) =>
                  p.id === "unlimited"
                    ? { ...f, unlimited: true, extendDays: 0 }
                    : {
                        ...f,
                        unlimited: false,
                        extendDays: 0,
                        expiresAtLocal: toDatetimeLocalValue(expiryFromDays(p.days)),
                      }
                )
              }
              className="text-xs rounded-full px-3 py-1.5 border cursor-pointer hover:opacity-90"
              style={{
                borderColor: "var(--border)",
                background:
                  p.id === "unlimited"
                    ? form.unlimited
                      ? "rgba(0,192,239,0.2)"
                      : "transparent"
                    : "transparent",
                color:
                  p.id === "unlimited"
                    ? form.unlimited
                      ? "#fff"
                      : "var(--muted)"
                    : "var(--muted)",
              }}
            >
              {p.id === "unlimited" ? "Unlimited" : `Set ${p.days} days`}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1 border-b pb-0" style={{ borderColor: "var(--border)" }}>
          {(
            [
              { id: "details", label: "Details" },
              { id: "restrictions", label: "Restrictions & Access" },
              { id: "bouquets", label: "Bouquets" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="px-4 py-2 text-sm font-medium rounded-t border-b-2 -mb-px cursor-pointer"
              style={{
                borderColor: tab === t.id ? "#00c0ef" : "transparent",
                color: tab === t.id ? "#00c0ef" : "var(--muted)",
                background: tab === t.id ? "rgba(0,192,239,0.08)" : "transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "details" && (
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-5">
            <Card title="Account">
              <FormField label="Username">
                <div className="flex items-center gap-2">
                  <CopyableCredential value={line.username} label="Username" />
                </div>
              </FormField>
              <FormField label="Password">
                <div className="flex gap-2">
                  <PasswordInput
                    className="flex-1"
                    value={form.password}
                    onChange={(password) => setForm({ ...form, password })}
                    placeholder={`Letters & numbers, min ${MIN_LINE_CREDENTIAL_LENGTH}`}
                    minLength={MIN_LINE_CREDENTIAL_LENGTH}
                  />
                  <button
                    type="button"
                    title="Generate new password"
                    onClick={() => setForm({ ...form, password: generateLinePassword() })}
                    className="shrink-0 rounded border px-3 cursor-pointer hover:bg-white/5 self-center"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <RefreshCw size={18} />
                  </button>
                </div>
              </FormField>
              {panel === "admin" && (
                <FormField label="Owner">
                  <select
                    className={formSelectClass}
                    style={formInputStyle}
                    value={form.ownerId}
                    onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
                  >
                    <option value="">Admin (unassigned)</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.username}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
              <FormField label="Max connections">
                <input
                  type="number"
                  min={1}
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.maxConnections}
                  onChange={(e) =>
                    setForm({ ...form, maxConnections: parseInt(e.target.value, 10) || 1 })
                  }
                />
              </FormField>
              <FormField label="Current expiry (UTC)">
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  value={
                    form.unlimited || isUnlimitedLineExpiry(line.expiresAt)
                      ? "UNLIMITED"
                      : formatDateTime(line.expiresAt)
                  }
                  readOnly
                  disabled
                />
              </FormField>
              {panel === "admin" && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.unlimited}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        unlimited: e.target.checked,
                        extendDays: e.target.checked ? 0 : form.extendDays,
                        expiresAtLocal: e.target.checked
                          ? form.expiresAtLocal || toDatetimeLocalValue(expiryFromDays(30))
                          : form.expiresAtLocal || toDatetimeLocalValue(expiryFromDays(30)),
                      })
                    }
                  />
                  Unlimited
                </label>
              )}
              {!form.unlimited && (
                <FormField label="Set expiry date">
                  <input
                    type="datetime-local"
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.expiresAtLocal.slice(0, 16)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        unlimited: false,
                        expiresAtLocal: e.target.value,
                        extendDays: 0,
                      })
                    }
                  />
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    Uncheck unlimited (admin) or pick a date to convert an unlimited line.
                  </p>
                </FormField>
              )}
              <FormField label="Extend subscription (days)">
                <input
                  type="number"
                  min={0}
                  className={formInputClass}
                  style={formInputStyle}
                  placeholder="0 = no change"
                  disabled={form.unlimited}
                  value={form.extendDays || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      unlimited: false,
                      extendDays: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </FormField>
              <FormField label="WHMCS / billing service ID">
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  placeholder="Optional external ID"
                  value={form.externalId}
                  onChange={(e) => setForm({ ...form, externalId: e.target.value })}
                />
              </FormField>
              {servers.length > 0 && (
                <FormField label="Forced server">
                  <select
                    className={formSelectClass}
                    style={formInputStyle}
                    value={form.forcedServerId}
                    onChange={(e) => setForm({ ...form, forcedServerId: e.target.value })}
                  >
                    <option value="">Auto (load balancer)</option>
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
            </Card>

            <Card title="Notes">
              {panel === "admin" && (
                <FormField label="Admin notes">
                  <textarea
                    className={formInputClass}
                    style={formInputStyle}
                    rows={4}
                    value={form.adminNotes}
                    onChange={(e) => setForm({ ...form, adminNotes: e.target.value })}
                  />
                </FormField>
              )}
              <FormField label={panel === "reseller" ? "Notes" : "Reseller notes"}>
                <textarea
                  className={formInputClass}
                  style={formInputStyle}
                  rows={4}
                  value={form.resellerNotes}
                  onChange={(e) => setForm({ ...form, resellerNotes: e.target.value })}
                />
              </FormField>
            </Card>

            <Card title="Status">
              <YesNo
                label="Is enabled"
                value={form.isEnabled}
                onChange={(v) => setForm({ ...form, isEnabled: v })}
              />
              {allowTrials || line.isTrial ? (
                <YesNo
                  label="Is trial account"
                  value={form.isTrial}
                  onChange={(v) => setForm({ ...form, isTrial: allowTrials ? v : false })}
                />
              ) : null}
              <YesNo
                label="Is restreamer"
                value={form.isRestreamer}
                onChange={(v) => setForm({ ...form, isRestreamer: v })}
              />
            </Card>

            <Card title="Access Output">
              <AccessOutputCheckboxes
                selected={form.accessOutputs}
                onChange={(accessOutputs: Set<AccessOutputId>) =>
                  setForm({ ...form, accessOutputs })
                }
                hint="Xtream output formats this line may use. HLS + MPEGTS + RTMP are all on by default (like XUI)."
              />
            </Card>
          </div>
        )}

        {tab === "restrictions" && (
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-5">
            <Card title="Geo & access">
              <FormField label="Allowed countries">
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  placeholder="US,GB (comma-separated)"
                  value={form.allowedCountries}
                  onChange={(e) => setForm({ ...form, allowedCountries: e.target.value })}
                />
              </FormField>
              <FormField label="Blocked countries">
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  placeholder="CN,RU"
                  value={form.blockedCountries}
                  onChange={(e) => setForm({ ...form, blockedCountries: e.target.value })}
                />
              </FormField>
              <FormField label="Allowed IP addresses / CIDR ranges">
                <textarea
                  className={formInputClass}
                  style={formInputStyle}
                  rows={3}
                  placeholder={"10.0.0.0/8\n203.0.113.10\n2001:db8::/32"}
                  value={form.allowedIps}
                  onChange={(e) => setForm({ ...form, allowedIps: e.target.value })}
                />
              </FormField>
              <FormField label="Allowed user-agents">
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.allowedUserAgents}
                  onChange={(e) => setForm({ ...form, allowedUserAgents: e.target.value })}
                />
              </FormField>
              <FormField label="Blocked ISPs (comma-separated)">
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  placeholder="Verizon,AT&T"
                  value={form.blockedIsps}
                  onChange={(e) => setForm({ ...form, blockedIsps: e.target.value })}
                />
              </FormField>
              <YesNo
                label="Activate lock to IP"
                value={form.lockToIp}
                onChange={(v) => setForm({ ...form, lockToIp: v })}
              />
              <AccessOutputCheckboxes
                selected={form.accessOutputs}
                onChange={(accessOutputs: Set<AccessOutputId>) =>
                  setForm({ ...form, accessOutputs })
                }
              />
            </Card>
          </div>
        )}

        {tab === "bouquets" && (
          <BouquetPickerTable
            bouquets={bouquets}
            selectedIds={form.bouquetIds}
            onChange={(bouquetIds) => setForm({ ...form, bouquetIds })}
          />
        )}

        <div className="flex justify-end gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <button type="button" className="btn-cancel rounded px-6 py-2.5 text-sm font-medium" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-positive rounded px-6 py-2.5 text-sm font-medium cursor-pointer disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save line"}
          </button>
        </div>
      </div>
    </form>
  );
}
