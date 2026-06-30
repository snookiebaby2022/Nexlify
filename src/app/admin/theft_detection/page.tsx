"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FormPageShell } from "@/components/form-page-shell";
import { IpWithFlag } from "@/components/ip-with-flag";

type Alert = {
  id: string;
  action: string;
  entityId: string | null;
  meta: { lineCount?: number; lineIds?: string[]; kind?: string; ip?: string };
  createdAt: string;
};

const defaultSettings = {
  enabled: true,
  sameIpLineThreshold: 3,
  autoDisableLine: false,
  lookbackMinutes: 10,
  vodTheftEnabled: true,
  vodSameIpLineThreshold: 2,
  streamTheftEnabled: true,
  streamSameIpLineThreshold: 3,
};

export default function TheftDetectionPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [settings, setSettings] = useState(defaultSettings);

  function load() {
    fetch("/api/admin/theft-detection")
      .then((r) => r.json())
      .then((d) => {
        setAlerts(d.alerts ?? []);
        if (d.settings) setSettings({ ...defaultSettings, ...d.settings });
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/theft-detection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    load();
  }

  const lineAlerts = alerts.filter((a) => a.action === "theft_detection_alert");
  const vodAlerts = alerts.filter((a) => a.action === "theft_vod_alert");
  const streamAlerts = alerts.filter((a) => a.action === "theft_stream_alert");

  return (
    <FormPageShell title="Theft Detection" manageHref="/admin/dashboard" manageLabel="Dashboard">
      <div className="space-y-8 max-w-3xl">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Detects account sharing: multiple lines from one IP, VOD theft (movies/series on several
          lines), and the same stream pulled on multiple lines. Runs on the hourly cron.
        </p>

        <form
          onSubmit={save}
          className="rounded-lg border p-5 space-y-6 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <label className="flex gap-2 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
            Master enable
          </label>

          <fieldset className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <legend className="font-semibold" style={{ color: "var(--accent)" }}>
              Line theft
            </legend>
            <label>
              Same-IP line threshold
              <input
                type="number"
                className="mt-1 w-full max-w-[120px] rounded border px-3 py-2 bg-transparent"
                style={{ borderColor: "var(--border)" }}
                value={settings.sameIpLineThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, sameIpLineThreshold: Number(e.target.value) })
                }
              />
            </label>
          </fieldset>

          <fieldset className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <legend className="font-semibold" style={{ color: "var(--accent)" }}>
              VOD theft
            </legend>
            <label className="flex gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.vodTheftEnabled}
                onChange={(e) => setSettings({ ...settings, vodTheftEnabled: e.target.checked })}
              />
              Enable VOD theft detection
            </label>
            <label>
              VOD — max lines per IP
              <input
                type="number"
                className="mt-1 w-full max-w-[120px] rounded border px-3 py-2 bg-transparent"
                style={{ borderColor: "var(--border)" }}
                value={settings.vodSameIpLineThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, vodSameIpLineThreshold: Number(e.target.value) })
                }
              />
            </label>
          </fieldset>

          <fieldset className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <legend className="font-semibold" style={{ color: "var(--accent)" }}>
              Stream theft
            </legend>
            <label className="flex gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.streamTheftEnabled}
                onChange={(e) => setSettings({ ...settings, streamTheftEnabled: e.target.checked })}
              />
              Enable stream theft detection
            </label>
            <label>
              Same stream — max lines per IP
              <input
                type="number"
                className="mt-1 w-full max-w-[120px] rounded border px-3 py-2 bg-transparent"
                style={{ borderColor: "var(--border)" }}
                value={settings.streamSameIpLineThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, streamSameIpLineThreshold: Number(e.target.value) })
                }
              />
            </label>
          </fieldset>

          <label>
            Lookback (minutes)
            <input
              type="number"
              className="mt-1 w-full max-w-[120px] rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={settings.lookbackMinutes}
              onChange={(e) => setSettings({ ...settings, lookbackMinutes: Number(e.target.value) })}
            />
          </label>

          <label className="flex gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoDisableLine}
              onChange={(e) => setSettings({ ...settings, autoDisableLine: e.target.checked })}
            />
            Auto-disable flagged lines
          </label>

          <button type="submit" className="btn-positive rounded px-4 py-2 cursor-pointer">
            Save settings
          </button>
        </form>

        <AlertList title="Line theft alerts" items={lineAlerts} />
        <AlertList title="VOD theft alerts" items={vodAlerts} />
        <AlertList title="Stream theft alerts" items={streamAlerts} />

        <Link href="/admin/line_activity" className="text-sm underline" style={{ color: "var(--accent)" }}>
          Line activity →
        </Link>
      </div>
    </FormPageShell>
  );
}

function AlertList({ title, items }: { title: string; items: Alert[] }) {
  return (
    <div>
      <h2 className="text-sm font-medium mb-2">{title}</h2>
      <ul className="text-sm space-y-2">
        {items.length === 0 && <li style={{ color: "var(--muted)" }}>No alerts yet.</li>}
        {items.map((a) => (
          <li
            key={a.id}
            className="rounded border px-3 py-2"
            style={{ borderColor: "var(--border)" }}
          >
            {a.action === "theft_stream_alert" ? (
              <>
                Stream <strong>{a.entityId}</strong> — IP{" "}
                {a.meta?.ip ? <IpWithFlag ip={a.meta.ip} mono={false} /> : <strong>?</strong>} —{" "}
                {a.meta?.lineCount ?? "?"} lines
              </>
            ) : (
              <>
                IP {a.entityId ? <IpWithFlag ip={a.entityId} mono={false} /> : <strong>?</strong>} —{" "}
                {a.meta?.lineCount ?? "?"} lines
              </>
            )}{" "}
            — {new Date(a.createdAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
