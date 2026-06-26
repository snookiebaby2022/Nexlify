"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_GROUP_CONFIG,
  mergeGroupConfig,
  RECOMMENDED_RESELLER_PERMISSIONS,
  RECOMMENDED_SUB_RESELLER_PERMISSIONS,
  RESELLER_PERMISSIONS,
  type GroupConfig,
  type GroupDashboardConfig,
} from "@/lib/group-config";
import { creditCostForDays, STANDARD_PACKAGE_TEMPLATES } from "@/lib/package-credits";
import {
  FormField,
  formInputClass,
  formInputStyle,
  formSelectClass,
} from "@/components/form-page-shell";
import { FileText, LayoutDashboard, Package, Shield, Users } from "lucide-react";

type TabId = "details" | "packages" | "permissions" | "subresellers" | "dashboard";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "details", label: "Details", icon: <FileText size={16} /> },
  { id: "packages", label: "Packages", icon: <Package size={16} /> },
  { id: "permissions", label: "Permissions", icon: <Shield size={16} /> },
  { id: "subresellers", label: "Subresellers", icon: <Users size={16} /> },
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
];

type GroupPayload = {
  id?: string;
  name: string;
  description: string;
  color: string;
  parentId: string;
  isReseller: boolean;
  isBanned: boolean;
  config: GroupConfig;
};

type PkgRow = {
  id: string;
  name: string;
  days: number;
  creditCost: number;
  isActive: boolean;
};

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative w-12 h-6 rounded-full transition-colors shrink-0"
        style={{ background: checked ? "#3c8dbc" : "#d1d5db" }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
          style={{ left: checked ? "1.5rem" : "0.125rem" }}
        />
      </button>
    </label>
  );
}

function RadioRow({
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
      <div style={{ color: "var(--muted)" }} className="mb-1">
        {label}
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={value} onChange={() => onChange(true)} />
          Yes
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={!value} onChange={() => onChange(false)} />
          No
        </label>
      </div>
    </div>
  );
}

export function GroupEditForm({
  groupId,
  title,
  backHref = "/admin/management/groups",
  manageLabel = "Manage Groups",
}: {
  groupId?: string;
  title: string;
  backHref?: string;
  manageLabel?: string;
}) {
  const [tab, setTab] = useState<TabId>("details");
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [allPackages, setAllPackages] = useState<PkgRow[]>([]);
  const [packagesBusy, setPackagesBusy] = useState(false);
  const [form, setForm] = useState<GroupPayload>({
    name: "",
    description: "",
    color: "#e85d4c",
    parentId: "",
    isReseller: true,
    isBanned: false,
    config: { ...DEFAULT_GROUP_CONFIG },
  });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(!!groupId);
  const [saving, setSaving] = useState(false);

  function loadPackages() {
    fetch("/api/admin/packages")
      .then((r) => r.json())
      .then((d) => setAllPackages(d.packages ?? []));
  }

  useEffect(() => {
    fetch("/api/admin/groups")
      .then((r) => r.json())
      .then((d) => setGroups(d.groups ?? []));
    loadPackages();
  }, []);

  useEffect(() => {
    if (!groupId) {
      fetch("/api/admin/groups/ensure-packages", { method: "POST" })
        .then((r) => r.json())
        .then((d) => {
          if (d.packageIds?.length) {
            setForm((f) => ({
              ...f,
              config: { ...f.config, packageIds: d.packageIds },
            }));
            setAllPackages(d.packages ?? []);
          }
        })
        .catch(() => {});
      return;
    }
    fetch(`/api/admin/groups?id=${groupId}`)
      .then((r) => r.json())
      .then((d) => {
        const g = d.group;
        setForm({
          id: g.id,
          name: g.name,
          description: g.description ?? "",
          color: g.color ?? "#e85d4c",
          parentId: g.parentId ?? "",
          isReseller: g.isReseller,
          isBanned: g.isBanned,
          config: mergeGroupConfig(g.config),
        });
        setLoading(false);
      });
  }, [groupId]);

  function setConfig<K extends keyof GroupConfig>(key: K, value: GroupConfig[K]) {
    setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));
  }

  function setDashboard<K extends keyof GroupDashboardConfig>(key: K, value: boolean) {
    setForm((f) => ({
      ...f,
      config: { ...f.config, dashboard: { ...f.config.dashboard, [key]: value } },
    }));
  }

  function togglePackage(id: string) {
    const ids = form.config.packageIds;
    setConfig(
      "packageIds",
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    );
  }

  function togglePermission(p: string) {
    const perms = form.config.permissions;
    setConfig(
      "permissions",
      perms.includes(p) ? perms.filter((x) => x !== p) : [...perms, p]
    );
  }

  function applyRecommendedPermissions(preset: "reseller" | "sub") {
    const list =
      preset === "sub"
        ? [...RECOMMENDED_SUB_RESELLER_PERMISSIONS]
        : [...RECOMMENDED_RESELLER_PERMISSIONS];
    setConfig("permissions", list.filter((p) => RESELLER_PERMISSIONS.includes(p)));
  }

  async function ensureStandardPackages() {
    setPackagesBusy(true);
    const res = await fetch("/api/admin/groups/ensure-packages", { method: "POST" });
    const data = await res.json();
    setPackagesBusy(false);
    if (res.ok) {
      setAllPackages(data.packages ?? []);
      setConfig("packageIds", data.packageIds ?? []);
      setMsg("Standard packages added with credit pricing (1 mo = 1, 3 mo = 2, …)");
    } else {
      setMsg(data.error ?? "Failed to create packages");
    }
  }

  function applyCreditPricingToSelected() {
    setAllPackages((rows) =>
      rows.map((p) => {
        if (!form.config.packageIds.includes(p.id)) return p;
        return { ...p, creditCost: creditCostForDays(p.days) };
      })
    );
    setMsg("Credit costs updated locally — save group to persist package rows.");
  }

  function nextTab() {
    const idx = TABS.findIndex((t) => t.id === tab);
    if (idx < TABS.length - 1) setTab(TABS[idx + 1].id);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    const method = groupId ? "PATCH" : "POST";
    const res = await fetch("/api/admin/groups", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: groupId,
        name: form.name,
        description: form.description || null,
        color: form.color,
        parentId: form.parentId || null,
        isReseller: form.isReseller,
        isBanned: form.isBanned,
        config: form.config,
        ensureStandardPackages: !groupId && form.config.packageIds.length === 0,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMsg(data.error ?? "Failed");
      return;
    }
    setMsg("Saved");
    if (!groupId && data.group?.id) {
      window.location.href = `/admin/management/groups/${data.group.id}`;
    }
  }

  if (loading) return <p className="text-sm">Loading…</p>;

  const parentOptions = groups.filter((g) => g.id !== groupId);
  const childGroups = groupId ? groups.filter((g) => g.id !== groupId) : [];

  return (
    <form onSubmit={save} className="max-w-4xl">
      <div
        className="flex items-center justify-between px-5 py-3.5 rounded-t-lg"
        style={{
          background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 50%, #2a9fd6 100%)",
        }}
      >
        <h1 className="text-lg font-semibold text-white tracking-wide">{title}</h1>
        <Link
          href={backHref}
          className="text-sm px-4 py-1.5 rounded border border-white/80 text-white hover:bg-white/10"
        >
          {manageLabel}
        </Link>
      </div>

      <div
        className="border border-t-0 rounded-b-lg overflow-hidden"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div
          className="flex flex-wrap gap-0 border-b"
          style={{ borderColor: "var(--border)", background: "#f8fafc" }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer"
              style={{
                borderColor: tab === t.id ? "#3c8dbc" : "transparent",
                color: tab === t.id ? "#fff" : "#64748b",
                background: tab === t.id ? "#3c8dbc" : "transparent",
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 md:p-8 space-y-4">
          {tab === "details" && (
            <div className="space-y-4 max-w-2xl">
              <FormField label="Group name" required>
                <input
                  required
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </FormField>
              <FormField label="Description">
                <textarea
                  className={formInputClass}
                  style={formInputStyle}
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </FormField>
              <FormField label="Group color">
                <div className="flex gap-2">
                  <input
                    type="color"
                    className="h-10 w-12 rounded border cursor-pointer"
                    style={{ borderColor: "var(--border)" }}
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                  />
                  <input
                    className={`${formInputClass} font-mono text-xs flex-1`}
                    style={formInputStyle}
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                  />
                </div>
              </FormField>
              <Toggle
                label="Is reseller"
                checked={form.isReseller}
                onChange={(isReseller) => setForm({ ...form, isReseller })}
              />
              <Toggle label="Is banned" checked={form.isBanned} onChange={(isBanned) => setForm({ ...form, isBanned })} />
              <RadioRow
                label="Is admin"
                value={form.config.isSuperAdmin}
                onChange={(v) => setConfig("isSuperAdmin", v)}
              />
              <RadioRow
                label="Access admin control panel"
                value={form.config.accessAdminCp}
                onChange={(v) => setConfig("accessAdminCp", v)}
              />
            </div>
          )}

          {tab === "packages" && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Assign packages to this group. Credit pricing:{" "}
                <strong>1 month = 1 credit</strong>, <strong>3 months = 2 credits</strong>, 6 months = 3,
                12 months = 4 (trials = 0).
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={packagesBusy}
                  className="text-sm px-3 py-2 rounded cursor-pointer disabled:opacity-60"
                  style={{ background: "#3c8dbc", color: "#fff" }}
                  onClick={ensureStandardPackages}
                >
                  {packagesBusy ? "Working…" : "Add standard packages"}
                </button>
                <button
                  type="button"
                  className="text-sm px-3 py-2 rounded border cursor-pointer"
                  style={{ borderColor: "var(--border)" }}
                  onClick={applyCreditPricingToSelected}
                >
                  Apply credit pricing to selected
                </button>
                <button
                  type="button"
                  className="text-sm px-3 py-2 rounded border cursor-pointer"
                  style={{ borderColor: "var(--border)" }}
                  onClick={() =>
                    setConfig(
                      "packageIds",
                      allPackages.map((p) => p.id)
                    )
                  }
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-sm px-3 py-2 rounded border cursor-pointer"
                  style={{ borderColor: "var(--border)" }}
                  onClick={() => setConfig("packageIds", [])}
                >
                  Clear
                </button>
              </div>
              <div className="rounded border overflow-auto" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-900" style={{ background: "#f8fafc", color: "#111827" }}>
                      <th className="p-2 w-10" />
                      <th className="text-left p-2">Package</th>
                      <th className="text-left p-2">Days</th>
                      <th className="text-left p-2">Credits</th>
                      <th className="text-left p-2">Suggested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPackages.map((p) => {
                      const suggested = creditCostForDays(p.days);
                      const selected = form.config.packageIds.includes(p.id);
                      return (
                        <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => togglePackage(p.id)}
                            />
                          </td>
                          <td className="p-2">{p.name}</td>
                          <td className="p-2">{p.days}</td>
                          <td className="p-2 font-medium">{p.creditCost}</td>
                          <td className="p-2" style={{ color: "var(--muted)" }}>
                            {suggested}
                            {p.creditCost !== suggested && (
                              <span className="text-xs ml-1 text-amber-600">(update on save)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Standard templates:{" "}
                {STANDARD_PACKAGE_TEMPLATES.map((t) => `${t.name} (${t.creditCost} cr)`).join(" · ")}
              </p>
            </div>
          )}

          {tab === "permissions" && (
            <div className="space-y-4 max-w-2xl">
              {!form.isReseller && (
                <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                  Enable <strong>Is reseller</strong> on the Details tab for these settings to apply.
                </p>
              )}
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                The below permissions will only take effect if the group has the Reseller permission set.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Allowed trials">
                  <input
                    type="number"
                    min={0}
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.config.trialLinesAllowed}
                    onChange={(e) => setConfig("trialLinesAllowed", Number(e.target.value))}
                    placeholder="0 = unlimited"
                  />
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    Use 0 for unlimited trial lines.
                  </p>
                </FormField>
                <FormField label="Allowed trials in">
                  <select
                    className={formSelectClass}
                    style={formInputStyle}
                    value={form.config.trialLinesPeriod}
                    onChange={(e) =>
                      setConfig("trialLinesPeriod", e.target.value as GroupConfig["trialLinesPeriod"])
                    }
                  >
                    <option value="hour">Hour</option>
                    <option value="day">Day</option>
                    <option value="month">Month</option>
                  </select>
                </FormField>
                <FormField label="Minimum credits for trials">
                  <input
                    type="number"
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.config.trialLinesMinCredits}
                    onChange={(e) => setConfig("trialLinesMinCredits", Number(e.target.value))}
                  />
                </FormField>
                <FormField label="Subreseller price">
                  <input
                    type="number"
                    step="0.01"
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.config.subResellerCreationCost}
                    onChange={(e) => setConfig("subResellerCreationCost", Number(e.target.value))}
                  />
                </FormField>
                <FormField label="Minimum username length">
                  <input
                    type="number"
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.config.minUsernameLength}
                    onChange={(e) => setConfig("minUsernameLength", Number(e.target.value))}
                  />
                </FormField>
                <FormField label="Minimum password length">
                  <input
                    type="number"
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.config.minPasswordLength}
                    onChange={(e) => setConfig("minPasswordLength", Number(e.target.value))}
                  />
                </FormField>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 pt-2">
                <Toggle
                  label="Allow line restrictions"
                  checked={form.config.allowLineRestrictions}
                  onChange={(v) => setConfig("allowLineRestrictions", v)}
                />
                <Toggle
                  label="Allow bouquet editing"
                  checked={form.config.allowBouquetEditing}
                  onChange={(v) => setConfig("allowBouquetEditing", v)}
                />
                <Toggle
                  label="Can delete users"
                  checked={form.config.canDeleteUsers}
                  onChange={(v) => setConfig("canDeleteUsers", v)}
                />
                <Toggle
                  label="Show M3U download"
                  checked={form.config.showM3uDownload}
                  onChange={(v) => setConfig("showM3uDownload", v)}
                />
              </div>
              {form.isReseller && (
                <div className="pt-4 border-t space-y-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">Module permissions</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border cursor-pointer"
                        style={{ borderColor: "var(--border)" }}
                        onClick={() => applyRecommendedPermissions("reseller")}
                      >
                        Recommended (reseller)
                      </button>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border cursor-pointer"
                        style={{ borderColor: "var(--border)" }}
                        onClick={() => applyRecommendedPermissions("sub")}
                      >
                        Recommended (sub-reseller)
                      </button>
                    </div>
                  </div>
                  <div
                    className="grid sm:grid-cols-2 gap-2 max-h-40 overflow-auto rounded border p-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {RESELLER_PERMISSIONS.map((p) => (
                      <label key={p} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.config.permissions.includes(p)}
                          onChange={() => togglePermission(p)}
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                  {form.config.allowBouquetEditing && !form.config.permissions.includes("bouquets.edit") && (
                    <button
                      type="button"
                      className="text-xs underline cursor-pointer"
                      style={{ color: "var(--accent)" }}
                      onClick={() => togglePermission("bouquets.edit")}
                    >
                      Enable bouquets.edit permission
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "subresellers" && (
            <div className="space-y-4 max-w-2xl">
              <FormField label="Sub-users group (parent)">
                <select
                  className={formSelectClass}
                  style={formInputStyle}
                  value={form.parentId}
                  onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                >
                  <option value="">— None —</option>
                  {parentOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Minimum transfer amount">
                <input
                  type="number"
                  step="0.01"
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.config.minTransferAmount}
                  onChange={(e) => setConfig("minTransferAmount", Number(e.target.value))}
                />
              </FormField>
              <RadioRow
                label="Can access subscriptions owned by other users"
                value={form.config.canAccessOtherSubscriptions}
                onChange={(v) => setConfig("canAccessOtherSubscriptions", v)}
              />
              <RadioRow
                label="Limit credit logs access"
                value={form.config.limitCreditLogsAccess}
                onChange={(v) => setConfig("limitCreditLogsAccess", v)}
              />
              <label className="block text-sm">
                <span style={{ color: "var(--muted)" }}>Range of accessible user data</span>
                <select
                  className={`${formSelectClass} mt-1 w-full`}
                  style={formInputStyle}
                  value={form.config.accessibleUserDataRange}
                  onChange={(e) => setConfig("accessibleUserDataRange", e.target.value)}
                >
                  <option value="non_super_admins">Extend to non-admins</option>
                  <option value="own_only">Own users only</option>
                  <option value="all">All users</option>
                </select>
              </label>
              {groupId && childGroups.length > 0 && (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Child groups can be assigned this group as their parent when creating sub-resellers.
                </p>
              )}
            </div>
          )}

          {tab === "dashboard" && (
            <div className="space-y-4 max-w-2xl">
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Choose which stats appear on the reseller dashboard for users in this group.
              </p>
              <Toggle
                label="Show online streams"
                checked={form.config.dashboard.showOnlineStreams}
                onChange={(v) => setDashboard("showOnlineStreams", v)}
              />
              <Toggle
                label="Show online users"
                checked={form.config.dashboard.showOnlineUsers}
                onChange={(v) => setDashboard("showOnlineUsers", v)}
              />
              <Toggle
                label="Show connections"
                checked={form.config.dashboard.showConnections}
                onChange={(v) => setDashboard("showConnections", v)}
              />
              <Toggle
                label="Show credits"
                checked={form.config.dashboard.showCredits}
                onChange={(v) => setDashboard("showCredits", v)}
              />
            </div>
          )}
        </div>

        <div
          className="flex justify-end gap-3 px-6 py-4 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          {tab !== "dashboard" ? (
            <button
              type="button"
              className="rounded px-5 py-2 text-sm font-medium cursor-pointer"
              style={{ background: "#3c8dbc", color: "#fff" }}
              onClick={nextTab}
            >
              Next
            </button>
          ) : (
            <>
              <Link href={backHref} className="btn-cancel rounded px-5 py-2 text-sm font-medium inline-flex items-center">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="btn-positive rounded px-5 py-2 text-sm font-medium cursor-pointer disabled:opacity-60"
              >
                {saving ? "Saving…" : groupId ? "Save group" : "Create group"}
              </button>
            </>
          )}
        </div>
        {msg && (
          <p className="px-6 pb-4 text-sm" style={{ color: "var(--muted)" }}>
            {msg}
          </p>
        )}
      </div>
    </form>
  );
}
