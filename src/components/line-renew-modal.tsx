"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { effectiveCreditCost } from "@/lib/package-credits";
import { isUnlimitedDurationDays, lineDurationPresetsForPanel } from "@/lib/line-duration-presets";
import { previewExtendedExpiry } from "@/lib/line-renew";
import { linesApiRoot, type PanelKind } from "@/lib/panel-api";

type PackageRow = { id: string; name: string; days: number; creditCost: number };

export function LineRenewModal({
  open,
  lineId,
  lineUsername,
  expiresAt,
  status,
  panel = "admin",
  onClose,
  onRenewed,
}: {
  open: boolean;
  lineId: string;
  lineUsername: string;
  expiresAt: string;
  status?: string;
  panel?: PanelKind;
  onClose: () => void;
  onRenewed: (result?: {
    expiresAt: string;
    status: string;
    creditsCharged?: number;
    creditsRemaining?: number;
  }) => void;
}) {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [packageId, setPackageId] = useState("");
  const [days, setDays] = useState(30);
  const [reactivate, setReactivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [success, setSuccess] = useState<{
    expiresAt: string;
    status: string;
    creditsCharged?: number;
    creditsRemaining?: number;
  } | null>(null);

  const paysCredits = panel === "reseller";
  const expiredOrDisabled = status === "EXPIRED" || status === "DISABLED";
  const selectedPkg = useMemo(
    () => (packageId ? packages.find((p) => p.id === packageId) ?? null : null),
    [packageId, packages]
  );
  const creditCost = useMemo(
    () => (paysCredits ? effectiveCreditCost(days, selectedPkg?.creditCost, false) : 0),
    [paysCredits, days, selectedPkg]
  );
  const balanceAfter = creditBalance != null ? Math.max(0, creditBalance - creditCost) : null;
  const previewExpiry = useMemo(() => {
    if (!days || days < 1) return null;
    try {
      return previewExtendedExpiry(expiresAt, days).toISOString();
    } catch {
      return null;
    }
  }, [expiresAt, days]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSuccess(null);
    setPackageId("");
    setDays(30);
    setReactivate(true);
    fetch("/api/admin/packages")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.packages ?? []) as PackageRow[];
        setPackages(
          panel === "admin" ? list : list.filter((p) => !isUnlimitedDurationDays(p.days))
        );
      })
      .catch(() => {});
    if (paysCredits) {
      fetch("/api/reseller/credits")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && typeof d.credits === "number") setCreditBalance(d.credits);
        })
        .catch(() => setCreditBalance(null));
    }
  }, [open, lineId, panel, paysCredits]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (days < 1) {
      setError("Enter at least 1 day to extend.");
      return;
    }
    if (panel !== "admin" && isUnlimitedDurationDays(days)) {
      setError("Only administrators can set unlimited lines.");
      return;
    }
    if (paysCredits && creditBalance != null && creditCost > creditBalance) {
      setError(`Insufficient credits (need ${creditCost}, have ${creditBalance}).`);
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`${linesApiRoot(panel)}/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        days,
        reactivate,
        ...(packageId ? { packageId } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Renew failed");
      return;
    }
    const charged =
      typeof data.creditsCharged === "number"
        ? data.creditsCharged
        : typeof data.renew?.creditsCharged === "number"
          ? data.renew.creditsCharged
          : creditCost;
    const remaining =
      typeof data.creditsRemaining === "number"
        ? data.creditsRemaining
        : typeof data.renew?.creditsRemaining === "number"
          ? data.renew.creditsRemaining
          : creditBalance != null
            ? Math.max(0, creditBalance - charged)
            : undefined;
    if (typeof remaining === "number") {
      setCreditBalance(remaining);
      window.dispatchEvent(
        new CustomEvent("nexlify-credits-updated", { detail: { credits: remaining } })
      );
    }
    const renewed = {
      expiresAt: data.line?.expiresAt ?? data.renew?.expiresAt ?? previewExpiry ?? expiresAt,
      status: data.line?.status ?? data.renew?.status ?? (reactivate ? "ACTIVE" : status ?? "ACTIVE"),
      creditsCharged: charged,
      creditsRemaining: remaining,
    };
    setSuccess(renewed);
    onRenewed(renewed);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg rounded-lg border p-5 space-y-4 shadow-xl"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="flex items-start gap-3">
          <span
            className="rounded-lg p-2 shrink-0"
            style={{ background: "rgba(0,192,239,0.15)", color: "#00c0ef" }}
          >
            <Calendar size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Renew subscription</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
              Line <span className="font-mono text-[var(--text)]">{lineUsername}</span>
            </p>
          </div>
        </div>

        {success ? (
          <div
            className="rounded-lg border p-4 space-y-2"
            style={{ borderColor: "rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.08)" }}
          >
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "#86efac" }}>
              <CheckCircle2 size={18} />
              Subscription renewed
            </div>
            <p className="text-sm" style={{ color: "var(--text)" }}>
              New expiry: <strong>{formatDateTime(success.expiresAt)}</strong>
            </p>
            {success.status ? (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Status: {success.status}
              </p>
            ) : null}
            {paysCredits ? (
              <p className="text-sm" style={{ color: "var(--text)" }}>
                Credits deducted: <strong>{success.creditsCharged ?? 0}</strong>
                {typeof success.creditsRemaining === "number" ? (
                  <>
                    {" "}
                    · Remaining: <strong>{success.creditsRemaining}</strong>
                  </>
                ) : null}
              </p>
            ) : null}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-4 py-2 text-sm font-medium"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border p-3 text-sm"
              style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.12)" }}
            >
              <div>
                <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>
                  Current expiry
                </div>
                <div className="font-medium">{formatDateTime(expiresAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>
                  Status
                </div>
                <div className="font-medium">{status ?? "—"}</div>
              </div>
              {previewExpiry ? (
                <div className="sm:col-span-2 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                  <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>
                    After renew (+{days} day{days === 1 ? "" : "s"})
                  </div>
                  <div className="font-semibold" style={{ color: "#00c0ef" }}>
                    {formatDateTime(previewExpiry)}
                  </div>
                </div>
              ) : null}
              {paysCredits ? (
                <div
                  className="sm:col-span-2 pt-1 border-t space-y-1"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                    Credits
                  </div>
                  <p className="font-medium">
                    This renew will deduct <strong>{creditCost}</strong> credit
                    {creditCost === 1 ? "" : "s"}
                    {creditBalance != null ? (
                      <>
                        {" "}
                        · Your balance: <strong>{creditBalance}</strong>
                        {balanceAfter != null ? (
                          <>
                            {" "}
                            → <strong>{balanceAfter}</strong> left
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </p>
                </div>
              ) : null}
            </div>

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
                <option value="">Custom days</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.days}d
                    {paysCredits
                      ? ` · ${effectiveCreditCost(p.days, p.creditCost)} cr`
                      : p.creditCost
                        ? ` · ${p.creditCost} cr`
                        : ""}
                    )
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block" style={{ color: "var(--muted)" }}>
                Or pick a duration
              </span>
              <div className="flex flex-wrap gap-2">
                {lineDurationPresetsForPanel(panel)
                  .filter((p) => p.id !== "unlimited" || panel === "admin")
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="rounded border px-2.5 py-1 text-xs"
                      style={{
                        borderColor: days === p.days ? "var(--accent)" : "var(--border)",
                        background:
                          days === p.days ? "rgba(0,192,239,0.12)" : "transparent",
                      }}
                      onClick={() => {
                        const match = packages.find((row) => row.days === p.days);
                        setPackageId(match?.id ?? "");
                        setDays(p.days);
                      }}
                    >
                      {p.label}
                      {paysCredits && p.creditCost > 0 ? ` (${p.creditCost} cr)` : ""}
                    </button>
                  ))}
              </div>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block" style={{ color: "var(--muted)" }}>
                Days to add
              </span>
              <input
                type="number"
                min={1}
                className="w-full rounded border px-3 py-2 bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                value={days}
                onChange={(e) => {
                  setPackageId("");
                  setDays(Math.max(1, Number(e.target.value) || 1));
                }}
              />
            </label>

            {expiredOrDisabled ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reactivate}
                  onChange={(e) => setReactivate(e.target.checked)}
                />
                Reactivate line (set status to Active)
              </label>
            ) : null}

            {error ? (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-4 py-2 text-sm border"
                style={{ borderColor: "var(--border)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded px-4 py-2 text-sm font-medium disabled:opacity-60"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {busy
                  ? "Renewing…"
                  : paysCredits
                    ? `Renew +${days} days (−${creditCost} cr)`
                    : `Renew +${days} days`}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
