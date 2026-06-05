"use client";

import { useEffect, useState } from "react";
import { SettingsPanel, SettingsSaveBar } from "@/components/settings-panel";

type BackupSettings = {
  enabled: boolean;
  scheduleCron: string;
  target: string;
  localPath: string;
  remoteProtocol: string;
  remoteHost: string;
  remotePort: number;
  remoteUser: string;
  remotePassword: string;
  remotePath: string;
  keepDays: number;
};

const EVERY_24H_CRON = "0 3 * * *";

function YesNo({
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
      <div className="mb-1.5" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={value} onChange={() => onChange(true)} />
          Yes
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={!value} onChange={() => onChange(false)} />
          No
        </label>
      </div>
    </div>
  );
}

export default function BackupSettingsPage() {
  const [data, setData] = useState<BackupSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings?group=backup")
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings as BackupSettings;
        setData({
          ...s,
          scheduleCron: s.scheduleCron || EVERY_24H_CRON,
        });
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "backup", settings: data }),
    });
    setMsg(res.ok ? "Settings saved successfully." : (await res.json()).error);
    setSaving(false);
  }

  async function runNow() {
    setRunning(true);
    const res = await fetch("/api/admin/backup", { method: "POST" });
    const j = await res.json();
    setMsg(res.ok ? `${j.message}${j.path ? ` → ${j.path}` : ""}` : j.error);
    setRunning(false);
  }

  if (!data) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading settings…</p>;
  }

  const inputClass = "mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm panel-select";
  const inputStyle = { borderColor: "var(--border)" };

  return (
    <form onSubmit={save} className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold">Backup</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Automatic panel backup every 24 hours (when cron daemon is running).
        </p>
      </div>

      <SettingsPanel
        title="Schedule"
        info="Requires PM2 process nexlify-cron. Default runs once per day at 03:00 UTC. Use Run backup now for an immediate snapshot."
      >
        <div className="grid md:grid-cols-2 gap-4 w-full">
          <YesNo
            label="Enable scheduled backups"
            value={data.enabled}
            onChange={(enabled) => setData({ ...data, enabled })}
          />
          <label className="block text-sm md:col-span-2">
            <span style={{ color: "var(--muted)" }}>Cron schedule (every 24 hours)</span>
            <div className="flex flex-wrap gap-2 mt-1">
              <input
                className={inputClass}
                style={inputStyle}
                value={data.scheduleCron}
                onChange={(e) => setData({ ...data, scheduleCron: e.target.value })}
              />
              <button
                type="button"
                className="rounded px-3 py-2 text-xs border shrink-0"
                style={{ borderColor: "var(--border)" }}
                onClick={() => setData({ ...data, scheduleCron: EVERY_24H_CRON })}
              >
                Reset to daily (03:00 UTC)
              </button>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Recommended: <code className="font-mono">{EVERY_24H_CRON}</code> — once every 24 hours
            </p>
          </label>
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Keep backups (days)</span>
            <input
              type="number"
              className={inputClass}
              style={inputStyle}
              value={data.keepDays}
              onChange={(e) => setData({ ...data, keepDays: parseInt(e.target.value, 10) })}
            />
          </label>
        </div>
      </SettingsPanel>

      <SettingsPanel title="Target">
        <div className="space-y-4 w-full">
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Backup target</span>
            <select
              className={inputClass}
              style={{ ...inputStyle, background: "#fff", color: "#111" }}
              value={data.target}
              onChange={(e) => setData({ ...data, target: e.target.value })}
            >
              <option value="local">Local server / VPS</option>
              <option value="remote">Remote server (SFTP/FTP)</option>
            </select>
          </label>
          {data.target === "local" ? (
            <label className="block text-sm">
              <span style={{ color: "var(--muted)" }}>Local folder path</span>
              <input
                className={inputClass}
                style={inputStyle}
                value={data.localPath}
                onChange={(e) => setData({ ...data, localPath: e.target.value })}
                placeholder="( add your folder location )"
              />
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                Example: <code className="font-mono">/home/nexlify-panel/backups</code> — leave placeholder empty to use{" "}
                <code className="font-mono">./backups</code> under the panel install
              </p>
            </label>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span style={{ color: "var(--muted)" }}>Protocol</span>
                <select
                  className={inputClass}
                  style={{ ...inputStyle, background: "#fff", color: "#111" }}
                  value={data.remoteProtocol}
                  onChange={(e) => setData({ ...data, remoteProtocol: e.target.value })}
                >
                  <option value="sftp">SFTP</option>
                  <option value="ftp">FTP</option>
                </select>
              </label>
              <label className="block text-sm">
                <span style={{ color: "var(--muted)" }}>Remote host</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={data.remoteHost}
                  onChange={(e) => setData({ ...data, remoteHost: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span style={{ color: "var(--muted)" }}>Port</span>
                <input
                  type="number"
                  className={inputClass}
                  style={inputStyle}
                  value={data.remotePort}
                  onChange={(e) => setData({ ...data, remotePort: parseInt(e.target.value, 10) })}
                />
              </label>
              <label className="block text-sm">
                <span style={{ color: "var(--muted)" }}>Username</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={data.remoteUser}
                  onChange={(e) => setData({ ...data, remoteUser: e.target.value })}
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <span style={{ color: "var(--muted)" }}>Password</span>
                <input
                  type="password"
                  className={inputClass}
                  style={inputStyle}
                  value={data.remotePassword}
                  onChange={(e) => setData({ ...data, remotePassword: e.target.value })}
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <span style={{ color: "var(--muted)" }}>Remote path</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  value={data.remotePath}
                  onChange={(e) => setData({ ...data, remotePath: e.target.value })}
                />
              </label>
            </div>
          )}
        </div>
      </SettingsPanel>

      <SettingsSaveBar saving={saving} msg={msg}>
        <button
          type="button"
          disabled={running}
          onClick={runNow}
          className="btn-positive rounded px-5 py-2.5 text-sm cursor-pointer disabled:opacity-50"
        >
          {running ? "Running…" : "Run backup now"}
        </button>
      </SettingsSaveBar>
    </form>
  );
}
