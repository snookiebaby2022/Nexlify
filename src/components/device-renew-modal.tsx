"use client";

import { useEffect, useState } from "react";
import { STANDARD_PACKAGE_TEMPLATES } from "@/lib/package-credits";
import { formatDateTime } from "@/lib/format";

type PackageRow = { id: string; name: string; days: number; creditCost: number };

export function DeviceRenewModal({
  open,
  lineId,
  lineUsername,
  expiresAt,
  onClose,
  onRenewed,
}: {
  open: boolean;
  lineId: string;
  lineUsername: string;
  expiresAt?: string | null;
  onClose: () => void;
  onRenewed: () => void;
}) {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [packageId, setPackageId] = useState("");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setPackageId("");
    setDays(30);
    fetch("/api/admin/packages")
      .then((r) => r.json())
      .then((d) => setPackages(d.packages ?? []))
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (days < 1) {
      setError("Enter at least 1 day to extend.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/lines/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Renew failed");
      return;
    }
    onRenewed();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-lg border p-5 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-lg font-semibold">Renew subscription</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Line <span className="font-mono">{lineUsername}</span>
          {expiresAt ? (
            <>
              {" "}
              · expires {formatDateTime(expiresAt)}
            </>
          ) : null}
        </p>
        <label className="block text-sm">
          <span className="mb-1 block" style={{ color: "var(--muted)" }}>
            Package (optional)
          </span>
          <select
            className="w-full rounded border px-3 py-2 bg-transparent text-sm"
            style={{ borderColor: "var(--border)" }}
            value={packageId}
            onChange={(e) => {
              const id = e.target.value;
              setPackageId(id);
              const pkg = packages.find((p) => p.id === id);
              if (pkg) setDays(pkg.days);
            }}
          >
            <option value="">Custom days…</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.days}d
                {p.creditCost > 0 ? ` · ${p.creditCost} cr` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {STANDARD_PACKAGE_TEMPLATES.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => setDays(t.days)}
              className="text-xs rounded-full px-3 py-1 border cursor-pointer"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              +{t.days}d
            </button>
          ))}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block" style={{ color: "var(--muted)" }}>
            Extend by (days)
          </span>
          <input
            type="number"
            min={1}
            required
            className="w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10) || 0)}
          />
        </label>
        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm border" style={{ borderColor: "var(--border)" }}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded px-4 py-2 text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {busy ? "Renewing…" : "Renew"}
          </button>
        </div>
      </form>
    </div>
  );
}
