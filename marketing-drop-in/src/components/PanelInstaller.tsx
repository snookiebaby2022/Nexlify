"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Info,
  KeyRound,
  RefreshCw,
  Terminal,
  Wrench,
} from "lucide-react";
import { useLiveInstallCommand } from "@/hooks/useLiveInstallCommand";
import { cleanReinstallWithFreshFlag, credentialsHelp, wgetInstallExample } from "@/lib/panel-install";

function CopyBlock({
  text,
  label,
  display,
}: {
  text: string;
  label: string;
  display?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl border border-white/10 bg-[#0d0b14] overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <span className="text-xs text-slate-500 font-mono">{label}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm font-mono text-slate-300 leading-relaxed whitespace-pre-wrap break-all">
        {display ?? text}
      </pre>
    </div>
  );
}

export function PanelInstaller() {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [license, setLicense] = useState("");
  const [ip, setIp] = useState("");
  const live = useLiveInstallCommand();
  const oneLine = useMemo(() => {
    const flags: string[] = [];
    if (ip.trim()) flags.push(`--ip ${ip.trim()}`);
    if (license.trim()) flags.push(`--license ${license.trim()}`);
    if (flags.length === 0) return live.command;
    return `${live.command} -s -- ${flags.join(" ")}`;
  }, [license, ip, live.command]);

  return (
    <section className="py-12 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Install the IPTV panel</h2>
        <p className="mt-2 text-[var(--muted)] leading-relaxed">
          One command as <strong className="text-slate-300">root</strong> on a fresh Ubuntu/Debian VPS.
          The installer checks RAM and disk, installs everything, then prints the login URL and admin password.
        </p>
        <p className="mt-1 text-xs text-slate-500">Installer {live.label} · usually 5–15 minutes</p>
      </div>

      <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-950/30 to-[#12101f] p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/20">
            <Terminal className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Copy and run</h3>
            <p className="text-xs text-[var(--muted)]">Server IP is detected automatically — no flags required</p>
          </div>
        </div>

        <CopyBlock text={oneLine} label={`bash · ${live.label}`} display={`$ ${oneLine}`} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-400">License key (optional)</span>
            <input
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              placeholder="NXLF1-…"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-400">Public IP override (optional)</span>
            <input
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="auto-detect"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600"
              autoComplete="off"
            />
          </label>
        </div>

        <ol className="list-decimal list-inside space-y-1 text-sm text-[var(--muted)]">
          <li>Paste the command in an SSH session as root and wait for the green DONE banner</li>
          <li>
            Open the printed login URL (also saved in{" "}
            <code className="text-emerald-400">{credentialsHelp.file}</code>)
          </li>
          <li>
            Sign in as <code className="text-emerald-400">admin</code> with the printed password, then add your
            license under Admin → License
          </li>
        </ol>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={live.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
          >
            <Download className="h-4 w-4" />
            View installer script
          </a>
          <a
            href="https://nexlify.live/downloads/nexlify-panel.tar.gz"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:border-violet-400/40 hover:text-white transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Download panel archive
          </a>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#12101f] p-5 flex items-start gap-4">
        <Info className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-white">What you need</h4>
          <ul className="mt-2 text-sm text-[var(--muted)] space-y-1 list-disc list-inside">
            <li>Ubuntu 22.04/24.04 or Debian 12 — a new VPS is easiest</li>
            <li>Root SSH, 2 vCPU, 4 GB RAM (2 GB minimum), 8 GB free disk</li>
            <li>Ports 80, 443, and 8080 free for the panel and IPTV apps</li>
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <KeyRound className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-3 w-full">
            <h3 className="text-lg font-semibold text-emerald-100">Where credentials are saved</h3>
            <p className="text-sm text-emerald-200/80 leading-relaxed">
              Login URL, admin password, and database password are printed at the end and written to{" "}
              <code className="text-emerald-100">{credentialsHelp.file}</code>.
            </p>
            <CopyBlock text={credentialsHelp.viewCommand} label="bash · view credentials" />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors"
        >
          <Wrench className="h-4 w-4" />
          {showAdvanced ? "Hide" : "Show"} advanced / recovery
        </button>

        {showAdvanced && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-[#12101f] p-5">
              <h4 className="text-sm font-semibold text-white mb-2">wget (if curl is missing)</h4>
              <CopyBlock text={wgetInstallExample} label="bash · wget" display={`$ ${wgetInstallExample}`} />
            </div>
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6 space-y-3">
              <div className="flex items-start gap-3">
                <RefreshCw className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-3 w-full">
                  <h3 className="text-lg font-semibold text-amber-100">Clean reinstall</h3>
                  <p className="text-sm text-amber-200/80 leading-relaxed">
                    Re-run the same command first — it continues an incomplete install. Use this only to wipe{" "}
                    <code className="text-amber-100">/home/nexlify</code> and start over.
                  </p>
                  <CopyBlock
                    text={cleanReinstallWithFreshFlag}
                    label="bash · --fresh"
                    display={`$ ${cleanReinstallWithFreshFlag}`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
