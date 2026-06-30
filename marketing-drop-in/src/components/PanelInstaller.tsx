"use client";

import { useState } from "react";
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
import {
  buildOneClickInstallCommand,
  cleanReinstallWithFreshFlag,
  credentialsHelp,
  INSTALLER_VERSION,
  oneClickInstallExample,
  PANEL_INSTALL_DIR,
  simpleInstallCommand,
  wgetInstallExample,
} from "@/lib/panel-install";

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

  const oneLine = oneClickInstallExample;
  const domainWithSsl = buildOneClickInstallCommand({
    domain: "panel.yourdomain.com",
    email: "you@yourdomain.com",
  });

  return (
    <section className="py-12 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">One-click installer</h2>
        <p className="mt-2 text-[var(--muted)] leading-relaxed">
          Paste one command as <strong className="text-slate-300">root</strong> using your VPS IP. Wait 5–15
          minutes. Sign in at <code className="text-violet-300">http://YOUR_SERVER_IP/login</code> — port 80, no{" "}
          <code className="text-violet-300">:3000</code>. Add your license in the panel after login. Add a custom
          domain later under Admin → Settings → Domains & SSL.
        </p>
        <p className="mt-1 text-xs text-slate-500">Installer {INSTALLER_VERSION}</p>
      </div>

      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <RefreshCw className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-100">Failed install? Start fresh</h3>
            <p className="text-sm text-amber-200/80 leading-relaxed">
              Removes <code className="text-amber-100">{PANEL_INSTALL_DIR}</code> and downloads a clean copy:
            </p>
            <CopyBlock text={cleanReinstallWithFreshFlag} label="bash · clean reinstall" display={`$ ${cleanReinstallWithFreshFlag}`} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-950/30 to-[#12101f] p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/20">
            <Terminal className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Copy &amp; run</h3>
            <p className="text-xs text-[var(--muted)]">Only --domain is required</p>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm space-y-2">
          <p className="font-semibold text-emerald-100">
            Replace <code className="text-emerald-200">YOUR_SERVER_IP</code> with your VPS IP address
          </p>
          <p className="text-xs text-emerald-200/80">
            The panel opens on port 80 using the IP. You can add a custom domain later under Admin → Settings →
            Domains & SSL.
          </p>
          <CopyBlock text={oneLine} label={`bash · ${INSTALLER_VERSION}`} display={`$ ${oneLine}`} />
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300 space-y-2">
          <p className="font-semibold text-white">After install</p>
          <ol className="list-decimal list-inside space-y-1 text-[var(--muted)]">
            <li>
              Open <code className="text-emerald-400">login_url</code> from the terminal (or{" "}
              <code className="text-emerald-400">cat /root/nexlify/install-credentials</code>)
            </li>
            <li>
              Login: <code className="text-emerald-400">admin</code> + password shown at end of install
            </li>
            <li>
              Paste license under <strong>Admin → License</strong> (
              <a href="/dashboard" className="text-violet-400 underline hover:text-violet-300">
                My licenses
              </a>
              )
            </li>
          </ol>
        </div>

        <details className="rounded-xl border border-white/10 bg-black/10">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-violet-300 hover:text-violet-200">
            Domain + HTTPS (optional)
          </summary>
          <div className="px-4 pb-4 space-y-2">
            <p className="text-xs text-[var(--muted)]">DNS must point at your VPS before running with --email.</p>
            <CopyBlock text={domainWithSsl} label="bash · domain + SSL" display={`$ ${domainWithSsl}`} />
          </div>
        </details>

        <details className="rounded-xl border border-white/10 bg-black/10">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-violet-300 hover:text-violet-200">
            Generic template (replace YOUR_SERVER_IP)
          </summary>
          <div className="px-4 pb-4">
            <CopyBlock text={simpleInstallCommand} label="bash · template" display={`$ ${simpleInstallCommand}`} />
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}`}
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

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <KeyRound className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-3 w-full">
            <h3 className="text-lg font-semibold text-emerald-100">Saved credentials</h3>
            <p className="text-sm text-emerald-200/80 leading-relaxed">
              Everything you need is printed when install completes and saved to{" "}
              <code className="text-emerald-100">{credentialsHelp.file}</code>.
            </p>
            <CopyBlock text={credentialsHelp.viewCommand} label="bash · view credentials" />
            <ul className="grid gap-2 sm:grid-cols-2 text-sm text-emerald-100/90">
              {credentialsHelp.fields.map((f) => (
                <li key={f.key} className="rounded-lg border border-emerald-500/15 bg-black/20 px-3 py-2">
                  <span className="font-mono text-xs text-emerald-300">{f.key}</span>
                  <div className="text-xs text-emerald-200/70 mt-0.5">{f.label}</div>
                </li>
              ))}
            </ul>
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
          {showAdvanced ? "Hide" : "Show"} alternative methods
        </button>

        {showAdvanced && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-[#12101f] p-5">
              <h4 className="text-sm font-semibold text-white mb-2">wget (if curl is unavailable)</h4>
              <CopyBlock text={wgetInstallExample} label="bash · wget" display={`$ ${wgetInstallExample}`} />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#12101f] p-5 flex items-start gap-4">
        <Info className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-white">Before you run</h4>
          <ul className="mt-2 text-sm text-[var(--muted)] space-y-1 list-disc list-inside">
            <li>Ubuntu 22.04/24.04 or Debian 12 — fresh VPS recommended</li>
            <li>Root or sudo over SSH</li>
            <li>
              <strong className="text-slate-300">Server is updated:</strong> installer runs{" "}
              <code className="text-violet-300">apt-get update && apt-get upgrade</code> first. Use{" "}
              <code className="text-violet-300">--skip-upgrade</code> to skip.
            </li>
            <li>
              <strong className="text-slate-300">IP install:</strong> panel on port 80 — use{" "}
              <code className="text-violet-300">http://IP/login</code>, never :3000
            </li>
            <li>
              <strong className="text-slate-300">Domain install:</strong> point DNS first for HTTPS with{" "}
              <code className="text-violet-300">--email</code>
            </li>
            <li>Minimum 2 vCPU / 4 GB RAM</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
