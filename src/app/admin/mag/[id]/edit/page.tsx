"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { MagModelSelect } from "@/components/mag-model-select";
import { DeviceRenewModal } from "@/components/device-renew-modal";
import { FormField, formInputClass, formInputStyle, formSelectClass } from "@/components/form-page-shell";
import { formatDateTime } from "@/lib/format";

type DeviceRow = {
  id: string;
  mac: string;
  model: string | null;
  isActive: boolean;
  line: { id: string; username: string; status: string; expiresAt: string };
};

export default function AdminMagEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lines, setLines] = useState<{ id: string; username: string }[]>([]);
  const [device, setDevice] = useState<DeviceRow | null>(null);
  const [form, setForm] = useState({ mac: "", lineId: "", model: "", isActive: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);

  function reload() {
    Promise.all([
      fetch("/api/admin/lines").then((r) => r.json()),
      fetch("/api/admin/mag").then((r) => r.json()),
    ]).then(([linesData, magData]) => {
      setLines(linesData.lines ?? []);
      const d = (magData.devices ?? []).find((x: DeviceRow) => x.id === id);
      if (d) {
        setDevice(d);
        setForm({
          mac: d.mac,
          lineId: d.line.id,
          model: d.model ?? "",
          isActive: d.isActive,
        });
      }
      setLoading(false);
    });
  }

  useEffect(() => {
    reload();
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/admin/mag", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...form }),
    });
    setSaving(false);
    if (!res.ok) {
      alert((await res.json()).error ?? "Failed");
      return;
    }
    router.push("/admin/mag");
  }

  if (loading) return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>;
  if (!device) return <p className="text-sm" style={{ color: "var(--danger)" }}>Device not found.</p>;

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/mag" className="text-sm" style={{ color: "var(--accent)" }}>
          ← MAG devices
        </Link>
        <Link href={`/admin/lines?edit=${device.line.id}`} className="text-sm" style={{ color: "var(--accent)" }}>
          Edit full line →
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">Edit MAG device</h1>

      <div
        className="rounded-lg border px-4 py-3 text-sm space-y-2"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <p>
          Line: <span className="font-mono">{device.line.username}</span> · {device.line.status}
        </p>
        <p style={{ color: "var(--muted)" }}>Expires: {formatDateTime(device.line.expiresAt)}</p>
        <button
          type="button"
          onClick={() => setRenewOpen(true)}
          className="text-sm rounded px-3 py-1.5 font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Renew subscription
        </button>
      </div>

      <form
        onSubmit={save}
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <FormField label="MAC address">
          <input
            className={`${formInputClass} font-mono`}
            style={formInputStyle}
            value={form.mac}
            onChange={(e) => setForm({ ...form, mac: e.target.value })}
            required
          />
        </FormField>
        <FormField label="Line">
          <select
            className={formSelectClass}
            style={formInputStyle}
            value={form.lineId}
            onChange={(e) => setForm({ ...form, lineId: e.target.value })}
            required
          >
            <option value="">Select line…</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.username}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Model">
          <MagModelSelect
            className={formSelectClass}
            style={formInputStyle}
            value={form.model}
            onChange={(model) => setForm({ ...form, model })}
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          Device active (portal auth enabled)
        </label>
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded py-3 font-semibold cursor-pointer disabled:opacity-60"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {saving ? "Saving…" : "Save device"}
        </button>
      </form>

      <DeviceRenewModal
        open={renewOpen}
        lineId={device.line.id}
        lineUsername={device.line.username}
        expiresAt={device.line.expiresAt}
        onClose={() => setRenewOpen(false)}
        onRenewed={reload}
      />
    </div>
  );
}
