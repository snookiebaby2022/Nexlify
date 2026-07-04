"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Save, HardDrive, Clock, Trash2 } from "lucide-react";

type CatchupSettings = {
  enabled: boolean;
  bufferHours: number;
  maxStorageGb: number;
  recordingFormat: "ts" | "mp4";
  autoCleanup: boolean;
  cleanupAfterHours: number;
};

export default function CatchupSettingsPage() {
  const [settings, setSettings] = useState<CatchupSettings | null>(null);
  const [storage, setStorage] = useState<{ usedGb: number; limitGb: number; percentUsed: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, storageRes] = await Promise.all([
        fetch("/api/admin/catchup?action=settings"),
        fetch("/api/admin/catchup?action=storage"),
      ]);
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (storageRes.ok) setStorage(await storageRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await fetch("/api/admin/catchup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-settings", settings }),
      });
    } finally {
      setSaving(false);
    }
  };

  const cleanup = async () => {
    await fetch("/api/admin/catchup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cleanup" }),
    });
    load();
  };

  if (loading || !settings) {
    return <div className="p-8 text-center" style={{ color: "var(--muted)" }}>Loading...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catch-up TV (DVR)</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Record live streams for time-shifted playback
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border hover:opacity-80" style={{ borderColor: "var(--border)" }}>
          <RefreshCw size={16} />
        </button>
      </div>

      {storage && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="flex items-center gap-2 mb-2">
            <HardDrive size={16} style={{ color: "var(--accent)" }} />
            <span className="text-sm font-semibold">Storage Usage</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-2 rounded-full" style={{ background: "rgba(148,163,184,0.2)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, storage.percentUsed)}%`,
                    background: storage.percentUsed > 80 ? "#ef4444" : storage.percentUsed > 60 ? "#f59e0b" : "#22c55e",
                  }}
                />
              </div>
            </div>
            <span className="text-sm tabular-nums">{storage.usedGb} / {storage.limitGb} GB</span>
          </div>
        </div>
      )}

      <div className="rounded-xl border p-6 space-y-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium">Enable Catch-up TV</span>
          <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} className="w-4 h-4" />
        </label>

        <div>
          <label className="text-sm font-medium">Buffer Duration (hours)</label>
          <input type="number" value={settings.bufferHours} onChange={(e) => setSettings({ ...settings, bufferHours: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg border bg-transparent text-sm" style={{ borderColor: "var(--border)" }} min={1} max={72} />
        </div>

        <div>
          <label className="text-sm font-medium">Max Storage (GB)</label>
          <input type="number" value={settings.maxStorageGb} onChange={(e) => setSettings({ ...settings, maxStorageGb: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg border bg-transparent text-sm" style={{ borderColor: "var(--border)" }} min={10} max={1000} />
        </div>

        <div>
          <label className="text-sm font-medium">Recording Format</label>
          <select value={settings.recordingFormat} onChange={(e) => setSettings({ ...settings, recordingFormat: e.target.value as "ts" | "mp4" })} className="w-full mt-1 px-3 py-2 rounded-lg border bg-transparent text-sm" style={{ borderColor: "var(--border)" }}>
            <option value="ts">MPEG-TS (.ts)</option>
            <option value="mp4">MP4 (.mp4)</option>
          </select>
        </div>

        <label className="flex items-center justify-between">
          <span className="text-sm font-medium">Auto-cleanup Expired</span>
          <input type="checkbox" checked={settings.autoCleanup} onChange={(e) => setSettings({ ...settings, autoCleanup: e.target.checked })} className="w-4 h-4" />
        </label>

        {settings.autoCleanup && (
          <div>
            <label className="text-sm font-medium">Cleanup After (hours)</label>
            <input type="number" value={settings.cleanupAfterHours} onChange={(e) => setSettings({ ...settings, cleanupAfterHours: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg border bg-transparent text-sm" style={{ borderColor: "var(--border)" }} min={1} max={168} />
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "var(--accent)" }}>
            <Save size={14} /> {saving ? "Saving..." : "Save Settings"}
          </button>
          <button onClick={cleanup} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border" style={{ borderColor: "var(--border)" }}>
            <Trash2 size={14} /> Cleanup Now
          </button>
        </div>
      </div>
    </div>
  );
}
