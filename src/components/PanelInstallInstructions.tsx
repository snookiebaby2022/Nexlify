"use client";

import { useState } from "react";
import { Check, Copy, Terminal, Server, Shield, Database, Globe } from "lucide-react";
import {
  buildOneClickInstallCommand,
  cleanReinstallWithFreshFlag,
  credentialsHelp,
  INSTALLER_VERSION,
  oneClickInstallExample,
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
  const oneLineCommand = oneClickInstallExample;
  const domainCommand = buildOneClickInstallCommand({
    domain: "panel.yourdomain.com",
    email: "you@yourdomain.com",
  });

  return (
    <section className="py-12 space-y-10">
      <div>
        <h2 className="text-2xl font-bold text-white">Installation guide</h2>
        <p className="mt-2 text-[var(--muted)]">
          Install the panel first, sign in, then add your license — under 15 minutes on a fresh VPS.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Terminal, label: "Node.js 20+", desc: "Runtime for panel & API" },
          { icon: Database, label: "PostgreSQL", desc: "Users, lines & streams" },
          { icon: Server, label: "PM2", desc: "Auto-restart on reboot" },
          { icon: Shield, label: "Port 80 / HTTPS", desc: "IP = direct :80 · domain = nginx + SSL" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-[#12101f] p-4">
            <Icon className="h-5 w-5 text-violet-400 mb-2" />
            <div className="text-sm font-semibold text-white">{label}</div>
            <div className="text-xs text-[var(--muted)] mt-1">{desc}</div>
          </div>
        ))}
      </div>

      <div>
        <Step number={1} title="Get a VPS">
          <p>
            Any fresh Ubuntu 22.04/24.04 or Debian 12 VPS. Minimum{" "}
            <strong className="text-white">2 vCPU / 4 GB RAM</strong> recommended. Hetzner, OVH,
            DigitalOcean, Vultr, and others all work.
          </p>
          <p>
            Open port <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono text-violet-300">22</code>{" "}
            (SSH) and <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono text-violet-300">80</code>{" "}
            (panel). Port <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono text-violet-300">443</code>{" "}
            only if you use HTTPS on a domain.
          </p>
        </Step>

        <Step number={2} title="Run the installer">
          <p>
            SSH in as <strong className="text-white">root</strong> (or sudo). Replace{" "}
            <code className="text-violet-300">YOUR_IP_OR_DOMAIN</code> with your server IP or hostname — only{" "}
            <code className="text-violet-300">--domain</code> is required:
          </p>
          <CodeBlock command={oneLineCommand}>
            <span className="text-slate-500">$</span> {oneLineCommand}
          </CodeBlock>
          <p className="text-xs text-slate-500">
            Installer version {INSTALLER_VERSION}. IP installs serve the panel on port 80 directly — use{" "}
            <code className="text-violet-300">http://YOUR_IP/login</code>, never{" "}
            <code className="text-violet-300">:3000</code>.
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
              <code className="text-violet-300">http://YOUR_IP/login</code> (no port in the address bar)
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

        <Step number={5} title="Optional: domain + HTTPS">
          <p>
            Point an A record at your VPS, then install with email for Let&apos;s Encrypt:
          </p>
          <CodeBlock command={domainCommand}>
            <span className="text-slate-500">$</span> {domainCommand}
          </CodeBlock>
        </Step>

        <Step number={6} title="Clean reinstall (if needed)">
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
                ["--domain", "Server IP (HTTP on :80) or hostname (nginx + optional SSL)", "Yes"],
                ["--email", "Let's Encrypt contact — enables HTTPS when DNS points here", "No"],
                ["--license", "Activate during install instead of in the panel UI", "No"],
                ["--fresh", "Remove old /opt/nexlify-panel before install", "No"],
                ["--skip-nginx", "Skip nginx (advanced)", "No"],
                ["--skip-ssl", "HTTP only on domains", "No"],
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

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <Globe className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-amber-100">Login URL shows :3000?</h4>
            <p className="text-sm text-amber-200/70 mt-1">
              You&apos;re on an older build. SSH in and run{" "}
              <code className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-mono text-amber-200">
                cd /opt/nexlify-panel && bash scripts/fix-panel-ip-login.sh
              </code>{" "}
              — or reinstall with the latest{" "}
              <code className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-mono text-amber-200">
                panel.sh?{INSTALLER_VERSION}
              </code>
              . The panel should always open at <code className="text-amber-200">http://YOUR_IP/login</code> with no
              port number.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
