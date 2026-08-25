"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DualListPicker, type DualListItem } from "@/components/dual-list-picker";
import { STANDARD_PACKAGE_TEMPLATES, creditCostForDays } from "@/lib/package-credits";

export type PackageFormValues = {
  name: string;
  creditCost: number;
  days: number;
  maxLines: number;
  extraDeviceSlots: number;
  bouquetIds: string[];
  allowResellers: boolean;
  allowSubResellers: boolean;
  isActive: boolean;
  profitPercent: number;
  shopEnabled: boolean;
  shopPriceCents: number;
};

const emptyForm: PackageFormValues = {
  name: "",
  creditCost: 0,
  days: 30,
  maxLines: 1,
  extraDeviceSlots: 0,
  bouquetIds: [],
  allowResellers: true,
  allowSubResellers: true,
  isActive: true,
  profitPercent: 0,
  shopEnabled: false,
  shopPriceCents: 0,
};

export function PackageForm({
  packageId,
  title = "Add Package",
  submitLabel = "Create package",
  onSuccess,
}: {
  packageId?: string;
  title?: string;
  submitLabel?: string;
  onSuccess?: () => void;
}) {
  const [bouquetItems, setBouquetItems] = useState<DualListItem[]>([]);
  const [form, setForm] = useState<PackageFormValues>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editing = Boolean(packageId);

  useEffect(() => {
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) =>
        setBouquetItems(
          (d.bouquets ?? []).map((b: { id: string; name: string }) => ({
            id: b.id,
            label: b.name,
          }))
        )
      );
  }, []);

  useEffect(() => {
    if (!packageId) return;
    fetch("/api/admin/packages?manage=1")
      .then((r) => r.json())
      .then((d) => {
        const pkg = (d.packages ?? []).find((p: { id: string }) => p.id === packageId);
        if (!pkg) return;
        setForm({
          name: pkg.name ?? "",
          creditCost: pkg.creditCost ?? 0,
          days: pkg.days ?? 30,
          maxLines: pkg.maxLines ?? 1,
          extraDeviceSlots: pkg.extraDeviceSlots ?? 0,
          bouquetIds: pkg.bouquetIds ?? [],
          allowResellers: pkg.allowResellers !== false,
          allowSubResellers: pkg.allowSubResellers !== false,
          isActive: pkg.isActive !== false,
          profitPercent: Number(pkg.profitPercent ?? 0),
          shopEnabled: pkg.shopEnabled === true,
          shopPriceCents: Number(pkg.shopPriceCents ?? 0),
        });
      });
  }, [packageId]);

  function applyTemplate(t: (typeof STANDARD_PACKAGE_TEMPLATES)[number]) {
    setForm({
      ...form,
      name: t.name,
      days: t.days,
      creditCost: t.creditCost,
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/packages", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: packageId, ...form } : form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      if (!editing) setForm(emptyForm);
      onSuccess?.();
      if (editing) {
        window.location.href = "/admin/management/packages";
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Link
          href="/admin/management/packages"
          className="text-sm rounded px-3 py-1.5 border"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Manage packages
        </Link>
      </div>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Subscription packages for lines (credits, duration, bouquets). Control which reseller levels can sell each package.
      </p>
      {!editing && (
        <div className="flex flex-wrap gap-2">
          {STANDARD_PACKAGE_TEMPLATES.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => applyTemplate(t)}
              className="text-xs rounded-full px-3 py-1 border cursor-pointer"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={submit}
        className="rounded-lg border p-4 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="grid md:grid-cols-4 gap-3">
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block" style={{ color: "var(--muted)" }}>
              Package name
            </span>
            <input
              required
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block" style={{ color: "var(--muted)" }}>
              Credits
            </span>
            <input
              type="number"
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.creditCost}
              onChange={(e) => setForm({ ...form, creditCost: parseInt(e.target.value, 10) || 0 })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block" style={{ color: "var(--muted)" }}>
              Days
            </span>
            <input
              type="number"
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.days}
              onChange={(e) => {
                const days = parseInt(e.target.value, 10) || 0;
                setForm({
                  ...form,
                  days,
                  creditCost: creditCostForDays(days),
                });
              }}
            />
          </label>
          <label className="block text-sm md:col-span-4 md:max-w-xs">
            <span className="mb-1 block" style={{ color: "var(--muted)" }}>
              Max lines (device slots base)
            </span>
            <input
              type="number"
              min={1}
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.maxLines}
              onChange={(e) => setForm({ ...form, maxLines: parseInt(e.target.value, 10) || 1 })}
            />
          </label>
          <label className="block text-sm md:col-span-4 md:max-w-xs">
            <span className="mb-1 block" style={{ color: "var(--muted)" }}>
              Extra device add-on slots
            </span>
            <input
              type="number"
              min={0}
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.extraDeviceSlots}
              onChange={(e) =>
                setForm({ ...form, extraDeviceSlots: parseInt(e.target.value, 10) || 0 })
              }
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block" style={{ color: "var(--muted)" }}>
              Profit % (NXT markup on credits)
            </span>
            <input
              type="number"
              min={0}
              step={0.1}
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.profitPercent}
              onChange={(e) => setForm({ ...form, profitPercent: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block" style={{ color: "var(--muted)" }}>
              Shop price (cents)
            </span>
            <input
              type="number"
              min={0}
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={form.shopPriceCents}
              onChange={(e) => setForm({ ...form, shopPriceCents: parseInt(e.target.value, 10) || 0 })}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-6 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.allowResellers}
              onChange={(e) => setForm({ ...form, allowResellers: e.target.checked })}
            />
            <span>Available to resellers</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.allowSubResellers}
              onChange={(e) => setForm({ ...form, allowSubResellers: e.target.checked })}
            />
            <span>Available to sub-resellers</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.shopEnabled}
              onChange={(e) => setForm({ ...form, shopEnabled: e.target.checked })}
            />
            <span>List on public /shop</span>
          </label>
          {editing && (
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span>Active (visible when selling lines/devices)</span>
            </label>
          )}
        </div>

        <DualListPicker
          items={bouquetItems}
          selectedIds={form.bouquetIds}
          onChange={(bouquetIds) => setForm({ ...form, bouquetIds })}
          availableTitle="Available bouquets"
          selectedTitle="In package"
          availableHint="Bouquets included when a reseller sells this package. ≫ assigns all."
          selectedHint="Default bouquet access for lines created from this package."
        />
        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded py-2 px-4 cursor-pointer disabled:opacity-60"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {saving ? "Saving…" : submitLabel}
        </button>
      </form>
    </div>
  );
}
