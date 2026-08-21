"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { normalizeMac } from "@/lib/mag";
import { normalizeEnigmaMac } from "@/lib/enigma";
import { FormField, formInputClass, formInputStyle, formSelectClass } from "@/components/form-page-shell";

type PackageRow = { id: string; name: string; days: number; creditCost: number };

export function DeviceAddForm({
  deviceKind,
  withPackage,
  apiPath,
  backHref,
  manageLabel,
  title,
  settingsHref = "/admin/settings/server",
}: {
  deviceKind: "mag" | "enigma";
  withPackage: boolean;
  apiPath: "/api/admin/mag" | "/api/admin/enigma";
  backHref: string;
  manageLabel: string;
  title: string;
  settingsHref?: string | null;
}) {
  const [mac, setMac] = useState("");
  const [model, setModel] = useState("");
  const [packageId, setPackageId] = useState("");
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [portalUrl, setPortalUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{
    mac: string;
    username: string;
    password: string;
    expiresAt?: string;
  } | null>(null);

  const portalKey = deviceKind === "mag" ? "magServerUrl" : "enigmaServerUrl";
  const normalize = deviceKind === "mag" ? normalizeMac : normalizeEnigmaMac;

  useEffect(() => {
    fetch("/api/admin/portal-urls")
      .then((r) => r.json())
      .then((d) => setPortalUrl(d[portalKey] || d.magServerUrl || "—"))
      .catch(() => {});
    if (withPackage) {
      fetch("/api/admin/packages")
        .then((r) => r.json())
        .then((d) => setPackages(d.packages ?? []))
        .catch(() => {});
    }
  }, [withPackage, portalKey]);

  const formattedMac = normalize(mac.trim());

  async function copyPortal() {
    if (!portalUrl || portalUrl === "—") return;
    try {
      await navigator.clipboard.writeText(portalUrl);
    } catch {
      /* ignore */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess(null);
    if (!formattedMac) {
      setError("Enter a valid MAC address (12 hex digits, e.g. 00:1A:79:00:00:01)");
      setBusy(false);
      return;
    }
    const body: Record<string, string> = { mac: formattedMac };
    if (withPackage && packageId) body.packageId = packageId;
    if (model.trim()) body.model = model.trim();

    const res = await fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to register device");
      return;
    }
    const line = data.device?.line;
    if (line?.username && line?.password) {
      setSuccess({
        mac: formattedMac,
        username: line.username,
        password: line.password,
        expiresAt: line.expiresAt,
      });
      setMac("");
      setModel("");
      setPackageId("");
      return;
    }
    window.location.href = backHref;
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div
        className="rounded-lg border p-4 text-sm space-y-3"
        style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}
      >
        <h3 className="font-semibold" style={{ color: "var(--accent)" }}>
          How to add a {deviceKind === "mag" ? "MAG" : "Enigma2"} device
        </h3>
        <div className="space-y-2 text-[var(--muted)]">
          <p>
            <strong>1.</strong> Register the MAC below (creates a line automatically
            {withPackage ? " from the selected package" : ""}).
          </p>
          <p>
            <strong>2.</strong> On the box, open <em>Portals</em> and enter the portal URL below (short form <code>/c/</code>).
          </p>
          <p>
            <strong>3.</strong> Reboot the box or reload the portal. It authenticates by MAC only (no username on the device).
          </p>
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Link href={backHref} className="text-sm link-back">
          ← {manageLabel}
        </Link>
      </div>

      <div
        className="rounded-lg border px-4 py-3 text-sm space-y-2"
        style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}
      >
        <p className="text-sm" style={{ color: "var(--muted)" }}>Portal URL (/c/) — enter on the device:</p>
        <p className="font-mono text-base break-all" style={{ color: "var(--accent)" }}>
          {portalUrl || "—"}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyPortal}
            className="text-xs px-3 py-1.5 rounded border cursor-pointer"
            style={{ borderColor: "var(--border)" }}
          >
            Copy portal URL
          </button>
          {settingsHref && (
            <Link href={settingsHref} className="text-xs underline" style={{ color: "var(--accent)" }}>
              Settings → Server &amp; port
            </Link>
          )}
        </div>
      </div>

      {success && (
        <div
          className="rounded-lg border p-4 text-sm space-y-2"
          style={{ borderColor: "var(--border)", background: "rgba(34,197,94,0.08)" }}
        >
          <p className="font-semibold" style={{ color: "var(--success, #22c55e)" }}>
            Device registered — {success.mac}
          </p>
          <p style={{ color: "var(--muted)" }}>
            Line (for reference / Xtream apps):{" "}
            <span className="font-mono">{success.username}</span> /{" "}
            <span className="font-mono">{success.password}</span>
          </p>
          {success.expiresAt && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Expires: {new Date(success.expiresAt).toLocaleString()}
            </p>
          )}
          <Link href={backHref} className="inline-block text-sm underline" style={{ color: "var(--accent)" }}>
            View all devices →
          </Link>
        </div>
      )}

      <form
        onSubmit={submit}
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        {withPackage && (
          <FormField label="Package *">
            <select
              id="device-package-select"
              className={formSelectClass}
              style={formInputStyle}
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
              required
            >
              <option value="">Select package…</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.days}d
                  {p.creditCost > 0 ? ` · ${p.creditCost} cr` : ""}
                </option>
              ))}
            </select>
          </FormField>
        )}

        <FormField label="MAC address *">
          <input
            className={`${formInputClass} font-mono`}
            style={formInputStyle}
            placeholder="00:1A:79:00:00:01"
            value={mac}
            onChange={(e) => setMac(e.target.value)}
            required
            autoComplete="off"
          />
          {mac.trim() && !formattedMac && (
            <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>
              MAC must be exactly 12 hexadecimal digits.
            </p>
          )}
          {formattedMac && (
            <p className="text-xs mt-1 font-mono" style={{ color: "var(--muted)" }}>
              Stored as: {formattedMac}
            </p>
          )}
        </FormField>

        <FormField label="Model (optional)">
          <input
            className={formInputClass}
            style={formInputStyle}
            placeholder={deviceKind === "mag" ? "MAG 254" : "OpenPLi / Dreambox"}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </FormField>

        {error && (
          <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--border)", color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded py-2 px-4 font-medium cursor-pointer disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {busy ? "Saving…" : "Register device"}
          </button>
          <Link href={backHref} className="rounded py-2 px-4 text-sm border" style={{ borderColor: "var(--border)" }}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
