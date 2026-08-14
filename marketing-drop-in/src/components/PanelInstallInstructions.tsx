"use client";

import { useState } from "react";
import { Check, Copy, Terminal, Server, Shield, Database, Globe } from "lucide-react";
import { useLiveInstallCommand } from "@/hooks/useLiveInstallCommand";
import {
  cleanReinstallWithFreshFlag,
  credentialsHelp,
  INSTALLER_CACHE_QUERY,
} from "@/lib/panel-install";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
      title={label}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ children, command }: { children: React.ReactNode; command: string }) {
  return (
    <div className="relative rounded-xl border border-white/10 bg-[#0d0b14] overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <span className="text-xs text-slate-500 font-mono">bash</span>
        <CopyButton text={command} label="Copy command" />
      </div>
      <pre className="overflow-x-auto p-4 text-sm font-mono text-slate-300 leading-relaxed whitespace-pre-wrap break-all">
        {children}
      </pre>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
          {number}
        </div>
        <div className="mt-2 h-full w-px bg-white/10" />
      </div>
      <div className="flex-1 pb-8">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <div className="mt-2 text-sm text-[var(--muted)] leading-relaxed space-y-3">{children}</div>
      </div>
    </div>
  );
}

export function PanelInstallInstructions() {
  const live = useLiveInstallCommand();
  const oneLineCommand = live.command;

  return (
    <section className="py-12 space-y-10">
      <div>
        <h2 className="text-2xl font-bold text-white">Installation guide</h2>
        <p className="mt-2 text-[var(--muted)]">
          Install the panel first, sign in, then add your license — under 15 minutes on a fresh server.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Terminal, label: "Node.js 20+", desc: "Runtime for panel & API" },
          { icon: Database, label: "PostgreSQL", desc: "Users, lines & streams" },
          { icon: Server, label: "PM2", desc: "Auto-restart on reboot" },
          { icon: Shield, label: "Port 80", desc: "Panel runs directly on port 80" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-[#12101f] p-4">
            <Icon className="h-5 w-5 text-violet-400 mb-2" />
            <div className="text-sm font-semibold text-white">{label}</div>
            <div className="text-xs text-[var(--muted)] mt-1">{desc}</div>
          </div>
        ))}
      </div>

      <div>
        <Step number={1} title="Get a server">
          <p>
            Any fresh Ubuntu 22.04/24.04 or Debian 12 server. Minimum{" "}
            <strong className="text-white">2 vCPU / 4 GB RAM</strong> recommended. Hetzner, OVH,
            DigitalOcean, Vultr, and others all work.
          </p>
          <p>
            Open ports{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono text-violet-300">22</code>{" "}
            (SSH),{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono text-violet-300">80</code>,{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono text-violet-300">443</code>,{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono text-violet-300">1935</code>{" "}
            (RTMP), and{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono text-violet-300">554</code>{" "}
            (RTSP). The installer opens these in UFW automatically. The panel uses port{" "}
            <code className="text-violet-300">80</code> for both the dashboard and IPTV streams.
          </p>
        </Step>

        <Step number={2} title="Run the installer">
          <p>
            SSH in as <strong className="text-white">root</strong> (or sudo). Paste one command — the installer
            auto-detects your server IP:
          </p>
          <CodeBlock command={oneLineCommand}>
            <span className="text-slate-500">$</span> {oneLineCommand}
          </CodeBlock>
          <p className="text-xs text-slate-500">
            Installer version {live.label}. The panel runs on port 80 — your login URL is printed when
            install finishes.
          </p>
        </Step>

        <Step number={3} title="Sign in">
          <p>
            When install finishes, copy the admin password from the terminal (also saved here):
          </p>
          <CodeBlock command={credentialsHelp.viewCommand}>
            <span className="text-slate-500">$</span> {credentialsHelp.viewCommand}
          </CodeBlock>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong className="text-white">URL:</strong>{" "}
              <code className="text-violet-300">login_url</code> from install output
            </li>
            <li>
              <strong className="text-white">User:</strong>{" "}
              <code className="text-violet-300">admin</code> + password from install output
            </li>
          </ul>
        </Step>

        <Step number={4} title="Add your license">
          <p>
            After login you&apos;ll land on the license page. Paste your{" "}
            <code className="text-violet-300">NXLF1...</code> key from{" "}
            <a href="/dashboard" className="text-violet-400 hover:text-violet-300 underline">
              My licenses
            </a>{" "}
            (purchase on <a href="/pricing" className="text-violet-400 hover:text-violet-300 underline">pricing</a>{" "}
            or start a{" "}
            <a href="/register?trial=1" className="text-violet-400 hover:text-violet-300 underline">
              free trial
            </a>
            ). You don&apos;t need <code className="text-violet-300">--license</code> on the install command.
          </p>
        </Step>

        <Step number={5} title="Clean reinstall (if needed)">
          <p>If a previous install failed, wipe and reinstall fresh:</p>
          <CodeBlock command={cleanReinstallWithFreshFlag}>
            <span className="text-slate-500">$</span> {cleanReinstallWithFreshFlag}
          </CodeBlock>
        </Step>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#12101f] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Installer options</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="pb-3 pr-4 font-medium">Flag</th>
                <th className="pb-3 pr-4 font-medium">Description</th>
                <th className="pb-3 font-medium">Required?</th>
              </tr>
            </thead>
            <tbody className="text-[var(--muted)]">
              {[
                ["--ip / --domain", "Override auto-detected server IP or hostname", "No"],
                ["--license", "Activate during install instead of in the panel UI", "No"],
                ["--fresh", "Remove old /home/nexlify before install (keeps bin/)", "No"],
                ["--dir PATH", "Install folder (default /home/nexlify)", "No"],
                ["--skip-firewall", "Do not open ufw ports", "No"],
                ["--monolithic", "Panel + stream engine on this host", "No"],
              ].map(([flag, desc, req]) => (
                <tr key={flag} className="border-b border-white/5 last:border-0">
                  <td className="py-3 pr-4 font-mono text-xs text-violet-300 whitespace-nowrap">{flag}</td>
                  <td className="py-3 pr-4">{desc}</td>
                  <td className="py-3 text-xs whitespace-nowrap">{req}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#12101f] p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">Post-install commands</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { cmd: "pm2 status", desc: "Check panel process" },
            { cmd: "pm2 logs nexlify", desc: "View live logs" },
            { cmd: "pm2 restart nexlify --update-env", desc: "Restart after .env change" },
            { cmd: "cat /root/nexlify/install-credentials", desc: "View admin login again" },
            { cmd: "bash scripts/fix-panel-ip-login.sh", desc: "Fix IP login / port 80 (on server)" },
          ].map(({ cmd, desc }) => (
            <div key={cmd} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-3">
              <Terminal className="h-4 w-4 text-violet-400 shrink-0" />
              <div>
                <code className="text-xs font-mono text-slate-300">{cmd}</code>
                <div className="text-xs text-[var(--muted)]">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-5">
        <div className="flex items-start gap-3">
          <Globe className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-sky-100">IPTV Smarters / Xtream login</h4>
            <p className="text-sm text-sky-200/70 mt-1">
              <span className="block">
                <strong className="text-sky-100">Server:</strong>{" "}
                <code className="rounded bg-sky-500/10 px-1.5 py-0.5 text-xs font-mono">your server IP</code>{" "}
                (from install output)
              </span>
              <span className="block">
                <strong className="text-sky-100">Port:</strong>{" "}
                <code className="text-sky-200">80</code>
              </span>
              <span className="block">
                <strong className="text-sky-100">Username &amp; Password:</strong> Your line credentials from the panel
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <Globe className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-amber-100">Need help?</h4>
            <p className="text-sm text-amber-200/70 mt-1">
              If the login page doesn&apos;t open, SSH in and run{" "}
              <code className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-mono text-amber-200">
                cd /home/nexlify && bash scripts/fix-panel-ip-login.sh
              </code>{" "}
              — or reinstall with the latest{" "}
              <code className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-mono text-amber-200">
                panel.sh?{INSTALLER_CACHE_QUERY}
              </code>
              . Check <code className="text-amber-200">login_url</code> in{" "}
              <code className="text-amber-200">/root/nexlify/install-credentials</code>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
