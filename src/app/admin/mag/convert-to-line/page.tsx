"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DevicePortalBanner } from "@/components/device-portal-banner";

type MagRow = {
  id: string;
  mac: string;
  isActive: boolean;
  line: { id: string; username: string };
};

export default function AdminMagConvertToLinePage() {
  const pathname = usePathname();
  const magListHref = pathname.startsWith("/reseller") ? "/reseller/mags" : "/admin/mag";

  const [devices, setDevices] = useState<MagRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  function load() {
    fetch("/api/admin/mag")
      .then((r) => r.json())
      .then((d) => setDevices(d.devices ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  const allSelected = devices.length > 0 && selected.size === devices.length;

  const selectedRows = useMemo(
    () => devices.filter((d) => selected.has(d.id)),
    [devices, selected]
  );

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(devices.map((d) => d.id)));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function convert() {
    if (selected.size === 0) {
      setError("Select at least one MAG device");
      return;
    }
    if (
      !confirm(
        `Convert ${selected.size} MAG device(s) to regular lines? The MAC binding will be removed; subscriptions stay active for M3U / Xtream apps.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    const res = await fetch("/api/admin/mag/convert-to-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Convert failed");
      return;
    }
    setMsg(
      `Converted ${data.converted} device(s) to lines: ${(data.lines ?? [])
        .map((l: { username: string }) => l.username)
        .join(", ")}`
    );
    setSelected(new Set());
    load();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Convert MAG devices to line</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Remove MAG portal binding and keep the subscription as a regular IPTV line (username /
            password for apps and M3U).
          </p>
        </div>
        <Link href={magListHref} className="text-sm link-back">
          ← Manage MAG devices
        </Link>
      </div>

      <div
        className="rounded-lg border p-4 text-sm space-y-3"
        style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}
      >
        <h3 className="font-semibold" style={{ color: "var(--accent)" }}>
          ℹ️ What happens when converting MAG to line?
        </h3>
        <div className="space-y-2 text-[var(--muted)]">
          <p>
            <strong>1. New line created</strong> — A username/password line is generated for each selected MAG device. The subscription stays active with the same duration.
          </p>
          <p>
            <strong>2. MAC binding removed</strong> — The device is no longer tied to the MAG portal. The MAC address becomes free.
          </p>
          <p>
            <strong>3. Use with any app</strong> — The new line works with any IPTV app (IPTV Smarters, TiviMate, GSE Smart IPTV, etc.) using M3U or Xtream Codes API.
          </p>
          <p className="text-xs text-amber-400">
            ⚠️ The original MAG device will stop working immediately unless re-registered as a new device.
          </p>
        </div>
      </div>

      <DevicePortalBanner deviceKind="mag" />

      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Select all ({devices.length})
          </label>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={convert}
            className="rounded px-4 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {busy ? "Converting…" : `Convert selected (${selected.size})`}
          </button>
        </div>

        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {devices.length === 0 && (
            <p className="px-4 py-8 text-sm text-center" style={{ color: "var(--muted)" }}>
              No MAG devices registered.
            </p>
          )}
          {devices.map((d) => (
            <label
              key={d.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02]"
            >
              <input
                type="checkbox"
                checked={selected.has(d.id)}
                onChange={() => toggle(d.id)}
              />
              <span className="font-mono text-sm min-w-[10rem]">{d.mac}</span>
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                Line: <strong style={{ color: "var(--fg)" }}>{d.line.username}</strong>
              </span>
              <span className="text-xs ml-auto" style={{ color: d.isActive ? "#4ade80" : "var(--muted)" }}>
                {d.isActive ? "Active" : "Off"}
              </span>
            </label>
          ))}
        </div>
      </div>

      {selectedRows.length > 0 && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Selected: {selectedRows.map((d) => d.mac).join(", ")}
        </p>
      )}
      {error && (
        <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--border)", color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {msg && (
        <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--border)", color: "#4ade80" }}>
          {msg}
        </p>
      )}
    </div>
  );
}
