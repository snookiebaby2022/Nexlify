"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  const [packageId, setPackageId] = useState("");
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [portalUrl, setPortalUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const portalKey = deviceKind === "mag" ? "magServerUrl" : "enigmaServerUrl";

  useEffect(() => {
    fetch("/api/admin/portal-urls")
      .then((r) => r.json())
      .then((d) => setPortalUrl(d[portalKey] || d.magServerUrl || "—"))
      .catch(() => {});
    if (withPackage) {
      fetch("/api/admin/packages")
        .then((r) => r.json())
        .then((d) => setPackages((d.packages ?? []).filter((p: { isActive: boolean }) => p.isActive)))
        .catch(() => {});
    }
  }, [withPackage, portalKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body: Record<string, string> = { mac: mac.trim() };
    if (withPackage && packageId) body.packageId = packageId;

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
    window.location.href = backHref;
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Link href={backHref} className="text-sm link-back">
          ← {manageLabel}
        </Link>
      </div>

      <div
        className="rounded-lg border px-4 py-3 text-sm"
        style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}
      >
        <p style={{ color: "var(--muted)" }}>
          Portal URL — enter on the {deviceKind === "mag" ? "MAG" : "Enigma2"} box:
        </p>
        <p className="mt-1 font-mono text-base break-all" style={{ color: "var(--accent)" }}>
          {portalUrl || "—"}
        </p>
        {settingsHref && (
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Change in{" "}
            <Link href={settingsHref} className="underline" style={{ color: "var(--accent)" }}>
              Settings → Server &amp; port
            </Link>
            .
          </p>
        )}
      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {deviceKind === "mag" ? "MAG" : "Enigma2"} devices are identified by <strong>MAC address</strong> only.
        {withPackage
          ? " Select a package and a subscription line is created automatically."
          : " A new line is created automatically for this MAC."}
      </p>

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
