"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { BouquetPickerTable, type BouquetPickerRow } from "@/components/bouquet-picker-table";
import { PasswordInput } from "@/components/password-input";
import { FormField, formInputClass, formInputStyle, formSelectClass } from "@/components/form-page-shell";
import {
  generateLinePassword,
  generateLineUsername,
  MIN_LINE_CREDENTIAL_LENGTH,
} from "@/lib/credential-generate";
import { LINE_DURATION_PRESETS } from "@/lib/line-duration-presets";
import { creditCostForDays } from "@/lib/package-credits";

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
      {title && <h3 className="text-sm font-semibold" style={{ color: "#00c0ef" }}>{title}</h3>}
      {children}
    </div>
  );
}

export function LineAddForm({
  mode = "admin",
  backHref = "/admin/lines",
  manageLabel = "Manage Lines",
  focusPackage = false,
}: {
  mode?: "admin" | "reseller";
  backHref?: string;
  manageLabel?: string;
  /** When true (Add Line with Package), scroll to package selector. */
  focusPackage?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"details" | "restrictions" | "bouquets">("details");
  const [bouquets, setBouquets] = useState<BouquetPickerRow[]>([]);
  const [owners, setOwners] = useState<{ id: string; username: string }[]>([]);
  const [packages, setPackages] = useState<
    { id: string; name: string; creditCost: number; days: number; maxLines: number }[]
  >([]);
  const [templates, setTemplates] = useState<
    { id: string; label: string; description: string; days: number; maxConnections: number; creditCost: number; isTrial: boolean; lockToIp: boolean; allowedCountries: string; blockedCountries: string; canWatchAdult: boolean }[]
  >([]);
  const [templateId, setTemplateId] = useState("");
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [creditHint, setCreditHint] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    ownerId: "",
    maxConnections: 1,
    expiresAt: "",
    unlimited: false,
    days: 30,
    adminNotes: "",
    resellerNotes: "",
    isEnabled: true,
    isTrial: false,
    isRestreamer: false,
    bouquetIds: [] as string[],
    allowedCountries: "",
    blockedCountries: "",
    allowedIps: "",
    allowedUserAgents: "",
    lockToIp: false,
    packageId: "",
  });

  function applyGenerated() {
    setForm((f) => ({
      ...f,
      username: generateLineUsername(),
      password: generateLinePassword(),
    }));
  }

  function applyLineTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTemplateId(id);
    setForm((f) => ({
      ...f,
      days: tpl.days,
      maxConnections: tpl.maxConnections,
      isTrial: tpl.isTrial,
      lockToIp: tpl.lockToIp,
      allowedCountries: tpl.allowedCountries,
      blockedCountries: tpl.blockedCountries,
      unlimited: false,
    }));
    setCreditHint(tpl.creditCost);
    if (autoGenerate) applyGenerated();
  }

  function applyDurationPreset(preset: (typeof LINE_DURATION_PRESETS)[number]) {
    const pkg = packages.find((p) => p.days === preset.days);
    setForm((f) => ({
      ...f,
      days: preset.days,
      isTrial: preset.isTrial,
      unlimited: false,
      packageId: pkg?.id ?? f.packageId,
      maxConnections: pkg?.maxLines ?? f.maxConnections,
    }));
    setCreditHint(preset.creditCost);
    if (autoGenerate) applyGenerated();
  }

  useEffect(() => {
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) => setBouquets(d.bouquets ?? []));
    fetch("/api/admin/packages")
      .then((r) => r.json())
      .then((d) => setPackages(d.packages ?? []));
    fetch("/api/admin/lines/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []));
    fetch("/api/admin/settings?group=security")
      .then((r) => r.json())
      .then((d) => {
        const on = d.settings?.autoGenerateLineCredentials !== false;
        setAutoGenerate(on);
        if (on) applyGenerated();
      })
      .catch(() => {});
    if (mode === "admin") {
      fetch("/api/admin/resellers")
        .then((r) => r.json())
        .then((d) =>
          setOwners(
            (d.resellers ?? d.users ?? []).filter(
              (u: { role: string }) => u.role === "RESELLER" || u.role === "SUB_RESELLER"
            )
          )
        );
    }
  }, [mode]);

  useEffect(() => {
    if (!focusPackage || packages.length === 0) return;
    document.getElementById("line-package-select")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusPackage, packages.length]);

  useEffect(() => {
    if (autoGenerate && !form.username && !form.password) applyGenerated();
  }, [autoGenerate, form.username, form.password]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let username = form.username.trim();
    let password = form.password.trim();
    if (autoGenerate) {
      if (!username) username = generateLineUsername();
      if (!password) password = generateLinePassword();
    }
    if (username.length < MIN_LINE_CREDENTIAL_LENGTH || password.length < MIN_LINE_CREDENTIAL_LENGTH) {
      alert(`Username and password must each be at least ${MIN_LINE_CREDENTIAL_LENGTH} characters.`);
      return;
    }

    const notes = [form.adminNotes, form.resellerNotes].filter(Boolean).join("\n---\n");
    const days = form.unlimited ? 3650 : form.isTrial ? 1 : form.days;

    setSaving(true);
    const res = await fetch("/api/admin/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        maxConnections: form.maxConnections,
        days,
        bouquetIds: form.bouquetIds,
        ownerId: mode === "admin" && form.ownerId ? form.ownerId : undefined,
        allowedCountries: form.allowedCountries || undefined,
        blockedCountries: form.blockedCountries || undefined,
        allowedIps: form.allowedIps || undefined,
        lockToIp: form.lockToIp,
        templateId: templateId || undefined,
        canWatchAdult: templates.find((t) => t.id === templateId)?.canWatchAdult ?? true,
        packageId: form.packageId || undefined,
        notes: notes || undefined,
        status: form.isEnabled ? "ACTIVE" : "DISABLED",
        isTrial: form.isTrial,
        isRestreamer: form.isRestreamer,
      }),
    });
    setSaving(false);
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Failed to create line");
      return;
    }
    router.push(backHref);
  }

  const expiryValue =
    form.expiresAt ||
    (() => {
      const d = new Date();
      d.setDate(d.getDate() + (form.unlimited ? 3650 : form.days));
      return d.toISOString().slice(0, 16);
    })();

  return (
    <form onSubmit={submit} className="max-w-6xl space-y-4 panel-form-mobile-tight">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 rounded-t-lg"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <div>
          <p className="text-xs text-white/80">Subscriptions</p>
          <h1 className="text-lg font-semibold text-white">Add Line</h1>
        </div>
        <Link
          href={backHref}
          className="text-sm px-4 py-1.5 rounded border border-white/80 text-white hover:bg-white/10"
        >
          {manageLabel}
        </Link>
      </div>

      <div
        className="rounded-b-lg border border-t-0 p-5 md:p-6 space-y-5"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="flex flex-wrap gap-2">
          {templates.length > 0 && (
            <select
              className={formSelectClass}
              style={formInputStyle}
              value={templateId}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) {
                  setTemplateId("");
                  return;
                }
                applyLineTemplate(id);
              }}
            >
              <option value="">Line template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id} title={t.description}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
          {LINE_DURATION_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyDurationPreset(p)}
              className="text-xs rounded-full px-3 py-1.5 border cursor-pointer hover:opacity-90"
              style={{
                borderColor: "var(--border)",
                background:
                  form.days === p.days && form.isTrial === p.isTrial
                    ? "rgba(0,192,239,0.2)"
                    : "transparent",
                color: form.days === p.days && form.isTrial === p.isTrial ? "#fff" : "var(--muted)",
              }}
            >
              {p.label}
              {mode === "reseller" && (
                <span className="ml-1 opacity-80">({p.creditCost} cr)</span>
              )}
            </button>
          ))}
        </div>
        {mode === "reseller" && creditHint !== null && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Credits for this duration: <strong>{creditHint}</strong> (from your group packages)
          </p>
        )}
        <div className="flex flex-wrap gap-1 border-b pb-0" style={{ borderColor: "var(--border)" }}>
          {(
            [
              { id: "details", label: "Details" },
              { id: "restrictions", label: "Restrictions" },
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
          <Card>
            <FormField label="Enter Name">
              <input
                className={formInputClass}
                style={formInputStyle}
                placeholder="Random value will be generated if left blank and auto-generate is on"
                value={form.username}
                minLength={MIN_LINE_CREDENTIAL_LENGTH}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </FormField>
            <FormField label="Enter Password">
              <div className="flex gap-2">
                <PasswordInput
                  className="flex-1"
                  value={form.password}
                  onChange={(password) => setForm({ ...form, password })}
                  placeholder={`Min ${MIN_LINE_CREDENTIAL_LENGTH} characters`}
                  required={!autoGenerate}
                />
                <button
                  type="button"
                  title="Generate username & password"
                  onClick={applyGenerated}
                  className="shrink-0 rounded border px-3 cursor-pointer hover:bg-white/5 self-center"
                  style={{ borderColor: "var(--border)" }}
                >
                  <RefreshCw size={18} />
                </button>
              </div>
            </FormField>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={autoGenerate}
                onChange={(e) => {
                  const on = e.target.checked;
                  setAutoGenerate(on);
                  if (on) applyGenerated();
                }}
              />
              Auto-generate username & password when empty (panel setting)
            </label>
            {mode === "admin" && (
              <FormField label="Line owner">
                <select
                  className={formSelectClass}
                  style={formInputStyle}
                  value={form.ownerId}
                  onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
                >
                  <option value="">Select user for line owner</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.username}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            {packages.length > 0 && (
              <FormField label="Group packages">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {packages.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setForm({
                            ...form,
                            packageId: p.id,
                            days: p.days,
                            maxConnections: p.maxLines,
                            isTrial: p.days === 1 && p.creditCost === 0,
                          });
                          setCreditHint(p.creditCost);
                          if (autoGenerate) applyGenerated();
                        }}
                        className="text-xs rounded-full px-3 py-1.5 border cursor-pointer hover:opacity-90"
                        style={{
                          borderColor: "var(--border)",
                          background:
                            form.packageId === p.id ? "rgba(0,192,239,0.25)" : "transparent",
                          color: form.packageId === p.id ? "#fff" : "var(--muted)",
                        }}
                      >
                        {p.name} · {p.creditCost} cr · {p.days}d
                      </button>
                    ))}
                  </div>
                  <select
                    id="line-package-select"
                    className={formSelectClass}
                    style={formInputStyle}
                    value={form.packageId}
                    onChange={(e) => {
                      const pkg = packages.find((p) => p.id === e.target.value);
                      setForm({
                        ...form,
                        packageId: e.target.value,
                        days: pkg?.days ?? form.days,
                        maxConnections: pkg?.maxLines ?? form.maxConnections,
                        isTrial: pkg?.days === 1 && (pkg?.creditCost ?? 0) === 0 ? true : form.isTrial,
                      });
                      setCreditHint(pkg ? pkg.creditCost : creditCostForDays(form.days));
                    }}
                  >
                    <option value="">Package (optional)</option>
                    {packages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.creditCost} cr, {p.days}d, max {p.maxLines} conn)
                      </option>
                    ))}
                  </select>
                </div>
              </FormField>
            )}
            <FormField label="Max Connections">
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
            <FormField label="Expiry date (UTC) — click to edit">
              <div className="relative">
                <input
                  type="datetime-local"
                  className={formInputClass}
                  style={formInputStyle}
                  value={expiryValue.slice(0, 16)}
                  disabled={form.unlimited}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                />
                {!form.unlimited && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none">
                    📅
                  </span>
                )}
              </div>
              {!form.unlimited && (
                <p className="text-xs text-[var(--muted)] mt-1">
                  Click the field to open the calendar picker. Select a date and time to set custom expiry.
                </p>
              )}
            </FormField>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.unlimited}
                onChange={(e) => setForm({ ...form, unlimited: e.target.checked })}
              />
              Mark as unlimited — ignore date input
            </label>
            {!form.unlimited && (
              <FormField label="Duration (days)">
                <input
                  type="number"
                  min={1}
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.days}
                  onChange={(e) => {
                    const days = parseInt(e.target.value, 10) || 30;
                    setForm({ ...form, days });
                    setCreditHint(creditCostForDays(days));
                  }}
                />
              </FormField>
            )}
          </Card>

          <Card title="Notes">
            {mode === "admin" && (
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
            <FormField label={mode === "reseller" ? "Notes" : "Reseller notes"}>
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
            <YesNo label="Is enabled" value={form.isEnabled} onChange={(v) => setForm({ ...form, isEnabled: v })} />
            <YesNo label="Is trial account" value={form.isTrial} onChange={(v) => setForm({ ...form, isTrial: v })} />
            <YesNo
              label="Is restreamer"
              value={form.isRestreamer}
              onChange={(v) => setForm({ ...form, isRestreamer: v })}
            />
          </Card>
        </div>
        )}

        {tab === "restrictions" && (
        <div className="grid lg:grid-cols-2 gap-4 sm:gap-5">
          <Card title="Restrictions">
            <FormField label="Allowed countries">
              <input
                className={formInputClass}
                style={formInputStyle}
                placeholder="US,GB"
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
            <FormField label="Allowed IP addresses">
              <textarea
                className={formInputClass}
                style={formInputStyle}
                rows={2}
                placeholder="One per line"
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
            <YesNo
              label="Activate lock to IP"
              value={form.lockToIp}
              onChange={(v) => setForm({ ...form, lockToIp: v })}
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

        <div className="flex justify-end gap-3 pt-2">
          <Link href={backHref} className="btn-cancel rounded px-6 py-2.5 text-sm font-medium">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="btn-positive rounded px-6 py-2.5 text-sm font-medium cursor-pointer disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create line"}
          </button>
        </div>
      </div>
    </form>
  );
}
