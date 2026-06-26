"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { SettingsPanel, SettingsSaveBar } from "@/components/settings-panel";
import { pathsFromBinRoot, NEXLIFY_BIN_ROOT } from "@/lib/bin-paths-layout";
import { resolveActiveSelection } from "@/lib/bin-version-pick";
import { pickBestFfmpeg, pickBestPhp } from "@/lib/bin-version-pick";
import type { BinVersionOption } from "@/lib/bin-version-types";

type BinSettings = Record<string, string | boolean | BinVersionOption[] | undefined>;

const SELECT_STYLE: CSSProperties = {
  borderColor: "var(--border)",
  background: "#ffffff",
  color: "#111827",
};

function PathField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <input
        className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm font-mono"
        style={{ borderColor: "var(--border)" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function VersionSelect({
  label,
  hint,
  versions,
  activeId,
  onSelect,
  installing,
  onInstall,
  onInstallLatest,
}: {
  label: string;
  hint: string;
  versions: BinVersionOption[];
  activeId: string;
  onSelect: (id: string) => void;
  installing?: boolean;
  onInstall: () => void;
  onInstallLatest: () => void;
}) {
  const active = versions.find((v) => v.id === activeId);
  const needsInstall = active && active.exists === false;
  const anyInstalled = versions.some((v) => v.exists);
  return (
    <div className="w-full space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {hint}
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          className="panel-select flex-1 min-w-[12rem] rounded-lg border px-3 py-2.5 text-sm font-medium shadow-sm"
          style={SELECT_STYLE}
          value={activeId}
          onChange={(e) => onSelect(e.target.value)}
        >
          {versions.length === 0 && <option value="">Scanning versions…</option>}
          {versions.map((v) => (
            <option key={v.id} value={v.id} style={{ color: "#111827", background: "#fff" }}>
              {v.label}
              {v.exists === false ? " — not installed" : v.exists ? " ✓" : ""}
            </option>
          ))}
        </select>
        {needsInstall && (
          <button
            type="button"
            disabled={installing}
            onClick={onInstall}
            className="btn-positive rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {installing ? "Installing…" : "Install"}
          </button>
        )}
        {!anyInstalled && (
          <button
            type="button"
            disabled={installing}
            onClick={onInstallLatest}
            className="btn-positive rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {installing ? "Installing…" : "Install latest"}
          </button>
        )}
      </div>
      {active && (
        <p className="text-xs font-mono break-all rounded px-2 py-1.5" style={{ color: "var(--muted)", background: "rgba(0,0,0,0.04)" }}>
          {active.path}
        </p>
      )}
    </div>
  );
}

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

export default function BinariesSettingsPage() {
  const [data, setData] = useState<BinSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [installingFfmpeg, setInstallingFfmpeg] = useState(false);
  const [installingPhp, setInstallingPhp] = useState(false);
  const [installMsg, setInstallMsg] = useState("");

  const applyVersions = useCallback((ffmpegVersions: BinVersionOption[], phpVersions: BinVersionOption[], prev: BinSettings) => {
    const ff = resolveActiveSelection(
      ffmpegVersions,
      String(prev.activeFfmpegId ?? ""),
      pickBestFfmpeg
    );
    const php = resolveActiveSelection(phpVersions, String(prev.activePhpId ?? ""), pickBestPhp);
    return {
      ...prev,
      ...pathsFromBinRoot(NEXLIFY_BIN_ROOT),
      ffmpegVersions,
      phpVersions,
      activeFfmpegId: ff.id,
      ffmpegPath: ff.path,
      activePhpId: php.id,
      phpPath: php.path,
    };
  }, []);

  const runDiscover = useCallback(
    async (base?: BinSettings, opts?: { autoInstallLatest?: boolean }) => {
      setDiscovering(true);
      const res = await fetch("/api/admin/binaries/discover");
      const j = await res.json();
      setDiscovering(false);
      if (!res.ok) return;

      let merged!: BinSettings;
      setData((prev) => {
        const p = base ?? prev ?? pathsFromBinRoot(NEXLIFY_BIN_ROOT);
        merged = applyVersions(j.ffmpegVersions ?? [], j.phpVersions ?? [], p as BinSettings);
        return merged;
      });

      if (!opts?.autoInstallLatest) return;

      const ff = (merged.ffmpegVersions as BinVersionOption[]) ?? [];
      const php = (merged.phpVersions as BinVersionOption[]) ?? [];
      let installed = false;
      if (!ff.some((v) => v.exists)) {
        await fetch("/api/admin/binaries/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "ffmpeg", installLatest: true }),
        });
        installed = true;
      }
      if (!php.some((v) => v.exists)) {
        await fetch("/api/admin/binaries/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "php", installLatest: true }),
        });
        installed = true;
      }
      if (installed) {
        const res2 = await fetch("/api/admin/binaries/discover");
        const j2 = await res2.json();
        if (res2.ok) {
          setData((prev) => {
            const p = prev ?? pathsFromBinRoot(NEXLIFY_BIN_ROOT);
            return applyVersions(j2.ffmpegVersions ?? [], j2.phpVersions ?? [], p as BinSettings);
          });
          setInstallMsg("Installed latest FFmpeg/PHP where possible.");
        }
      }
    },
    [applyVersions]
  );

  async function installVersion(tool: "ffmpeg" | "php", versionId: string, installLatest = false) {
    if (tool === "ffmpeg") setInstallingFfmpeg(true);
    else setInstallingPhp(true);
    setInstallMsg("");
    const res = await fetch("/api/admin/binaries/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, versionId: installLatest ? undefined : versionId, installLatest }),
    });
    const j = await res.json();
    if (tool === "ffmpeg") setInstallingFfmpeg(false);
    else setInstallingPhp(false);
    setInstallMsg(j.ok ? (j.log?.join(" ") ?? "Installed.") : j.error ?? j.log?.join(" ") ?? "Install failed");
    await runDiscover();
  }

  useEffect(() => {
    fetch("/api/admin/settings?group=binaries")
      .then((r) => r.json())
      .then((d) => {
        const settings = {
          ...pathsFromBinRoot(NEXLIFY_BIN_ROOT),
          ...(d.settings ?? {}),
          binRoot: NEXLIFY_BIN_ROOT,
        } as BinSettings;
        setData(settings);
        void runDiscover(settings, { autoInstallLatest: true });
      });
  }, [runDiscover]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    setMsg("");
    const payload = {
      ...data,
      ...pathsFromBinRoot(NEXLIFY_BIN_ROOT),
      binRoot: NEXLIFY_BIN_ROOT,
    };
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "binaries", settings: payload }),
    });
    setMsg(res.ok ? "Settings saved successfully." : (await res.json()).error);
    setSaving(false);
  }

  function selectFfmpeg(id: string) {
    const versions = (data?.ffmpegVersions as BinVersionOption[]) ?? [];
    const hit = versions.find((v) => v.id === id);
    setData((prev) => ({
      ...(prev ?? {}),
      activeFfmpegId: id,
      ffmpegPath: hit?.path ?? "",
    }));
  }

  function selectPhp(id: string) {
    const versions = (data?.phpVersions as BinVersionOption[]) ?? [];
    const hit = versions.find((v) => v.id === id);
    setData((prev) => ({
      ...(prev ?? {}),
      activePhpId: id,
      phpPath: hit?.path ?? "",
    }));
  }

  function useBestVersions() {
    const ffmpegVersions = (data?.ffmpegVersions as BinVersionOption[]) ?? [];
    const phpVersions = (data?.phpVersions as BinVersionOption[]) ?? [];
    const ff = pickBestFfmpeg(ffmpegVersions);
    const php = pickBestPhp(phpVersions);
    if (ff) selectFfmpeg(ff.id);
    if (php) selectPhp(php.id);
  }

  const ffmpegVersions = (data?.ffmpegVersions as BinVersionOption[]) ?? [];
  const phpVersions = (data?.phpVersions as BinVersionOption[]) ?? [];

  if (!data) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading settings…</p>;
  }

  const str = (k: string) => String(data[k] ?? "");

  return (
    <form onSubmit={save} className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold">Server binaries</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Tools under <code className="font-mono">{NEXLIFY_BIN_ROOT}</code> — nginx, FFmpeg, PHP, Redis, certbot.
        </p>
      </div>

      <SettingsPanel title="Stream servers" info="Use bundled binaries from Nexlify bin layout on edge servers.">
        <YesNo
          label="Prefer bundled binaries on stream servers"
          value={Boolean(data.useBundledOnStreamServers)}
          onChange={(v) => setData({ ...data, useBundledOnStreamServers: v })}
        />
      </SettingsPanel>

      <SettingsPanel
        title="FFmpeg versions"
        info="All known FFmpeg builds (catalog + scan). Pick the newest installed build for best codec support."
      >
        <div className="w-full space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={discovering}
              onClick={() => void runDiscover()}
              className="rounded-lg px-4 py-2 text-sm cursor-pointer border disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}
            >
              {discovering ? "Scanning…" : "Rescan installed versions"}
            </button>
            <button type="button" onClick={useBestVersions} className="btn-positive rounded-lg px-4 py-2 text-sm font-medium cursor-pointer">
              Use best installed
            </button>
          </div>
          {installMsg && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {installMsg}
            </p>
          )}
          <VersionSelect
            label="Active FFmpeg"
            hint="Used for stream probe and transcoding on this panel. Latest is auto-installed when none are present."
            versions={ffmpegVersions}
            activeId={String(data.activeFfmpegId ?? "")}
            onSelect={selectFfmpeg}
            installing={installingFfmpeg}
            onInstall={() => void installVersion("ffmpeg", String(data.activeFfmpegId ?? ""))}
            onInstallLatest={() => void installVersion("ffmpeg", "", true)}
          />
          {ffmpegVersions.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium" style={{ color: "var(--muted)" }}>
                All FFmpeg paths ({ffmpegVersions.length})
              </summary>
              <ul className="mt-2 max-h-48 overflow-auto rounded border p-2 space-y-1 font-mono" style={{ borderColor: "var(--border)" }}>
                {ffmpegVersions.map((v) => (
                  <li key={v.id} style={{ color: v.exists ? "var(--muted)" : "var(--danger)" }}>
                    {v.label}: {v.path}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </SettingsPanel>

      <SettingsPanel title="PHP versions" info="PHP CLI for scripts and cron. Prefer PHP 8.4+ when available.">
        <div className="w-full space-y-4">
          <VersionSelect
            label="Active PHP"
            hint="CLI binary used by panel jobs on this server. Latest is auto-installed when none are present."
            versions={phpVersions}
            activeId={String(data.activePhpId ?? "")}
            onSelect={selectPhp}
            installing={installingPhp}
            onInstall={() => void installVersion("php", String(data.activePhpId ?? ""))}
            onInstallLatest={() => void installVersion("php", "", true)}
          />
          {phpVersions.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium" style={{ color: "var(--muted)" }}>
                All PHP paths ({phpVersions.length})
              </summary>
              <ul className="mt-2 max-h-48 overflow-auto rounded border p-2 space-y-1 font-mono" style={{ borderColor: "var(--border)" }}>
                {phpVersions.map((v) => (
                  <li key={v.id} style={{ color: v.exists ? "var(--muted)" : "var(--danger)" }}>
                    {v.label}: {v.path}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </SettingsPanel>

      <SettingsPanel title="Web & streaming">
        <div className="grid md:grid-cols-2 gap-4 w-full">
          <PathField label="Nginx" value={str("nginxPath")} onChange={(v) => setData({ ...data, nginxPath: v })} />
          <PathField label="Nginx RTMP" value={str("nginxRtmpPath")} onChange={(v) => setData({ ...data, nginxRtmpPath: v })} />
          <PathField label="Redis server" value={str("redisPath")} onChange={(v) => setData({ ...data, redisPath: v })} />
          <PathField label="MaxMind directory" value={str("maxmindPath")} onChange={(v) => setData({ ...data, maxmindPath: v })} />
        </div>
      </SettingsPanel>

      <SettingsPanel title="SSL & daemons">
        <div className="grid md:grid-cols-2 gap-4 w-full">
          <PathField label="Certbot" value={str("certbotPath")} onChange={(v) => setData({ ...data, certbotPath: v })} />
          <PathField label="daemons.sh" value={str("daemonsSh")} onChange={(v) => setData({ ...data, daemonsSh: v })} />
          <label className="block text-sm md:col-span-2">
            <span style={{ color: "var(--muted)" }}>Notes</span>
            <textarea
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
              style={{ borderColor: "var(--border)" }}
              rows={2}
              value={str("notes")}
              onChange={(e) => setData({ ...data, notes: e.target.value })}
            />
          </label>
        </div>
      </SettingsPanel>

      <SettingsSaveBar saving={saving} msg={msg} />
    </form>
  );
}
