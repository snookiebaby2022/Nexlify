"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, RefreshCw, Terminal, Wrench } from "lucide-react";
import { INSTALLER_VERSION, PANEL_INSTALL_DIR } from "@/lib/panel-install";

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

function FixCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#12101f] p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      <div className="space-y-4 text-sm text-[var(--muted)] leading-relaxed">{children}</div>
    </div>
  );
}

export function PanelTroubleshooting() {
  const fixAutoUpdateCommand = `curl -fsSL 'https://nexlify.live/install/fix-panel-auto-update.sh' | sudo bash`;
  const applyUpdateCommand = `cd ${PANEL_INSTALL_DIR} && bash scripts/apply-panel-fast-update.sh all`;
  const recoverCommand = `cd ${PANEL_INSTALL_DIR} && bash scripts/panel-update-recover.sh`;
  const quickRecoverCommand = `cd ${PANEL_INSTALL_DIR} && bash scripts/panel-update-recover.sh --quick`;
  const fixIpLoginCommand = `cd ${PANEL_INSTALL_DIR} && bash scripts/fix-panel-ip-login.sh`;
  const reinstallCommand = `curl -fsSL 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash -s -- --fresh --domain YOUR_SERVER_IP`;
  const statusCommand = `pm2 status && pm2 logs nexlify --lines 50`;
  const heldPackagesCheck = `dpkg --get-selections | grep hold`;
  const heldPackagesFix = `sudo dpkg --configure -a
sudo apt --fix-broken install`;

  return (
    <section className="py-12 space-y-8" id="troubleshooting">
      <div>
        <div className="flex items-center gap-3">
          <Wrench className="h-6 w-6 text-violet-400" />
          <h2 className="text-2xl font-bold text-white">Troubleshooting &amp; manual fixes</h2>
        </div>
        <p className="mt-2 text-[var(--muted)]">
          If the installer stops, the update shows no version, or the panel won&apos;t start, run the commands below on
          your VPS as <strong className="text-slate-300">root</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <FixCard title="Install fails with held broken packages" icon={AlertTriangle}>
          <p>
            Ubuntu sometimes blocks package installs when dependencies are held. Fix apt first, then re-run the
            installer:
          </p>
          <CopyBlock text={heldPackagesFix} label="bash · fix apt" display={`$ ${heldPackagesFix}`} />
          <p className="text-xs text-slate-500">
            Check held packages: <code className="text-violet-300">{heldPackagesCheck}</code>. Unhold with{" "}
            <code className="text-violet-300">sudo apt-mark unhold &lt;package&gt;</code> if needed.
          </p>
          <CopyBlock text={reinstallCommand} label="bash · reinstall" display={`$ ${reinstallCommand}`} />
        </FixCard>

        <FixCard title="Update panel manually" icon={RefreshCw}>
          <p>
            The auto-update URL is bootstrapped from the panel itself. If Admin → Updates is stuck, SSH in and run the
            fix-updater followed by the apply script:
          </p>
          <CopyBlock text={fixAutoUpdateCommand} label="bash · fix updater" display={`$ ${fixAutoUpdateCommand}`} />
          <CopyBlock text={applyUpdateCommand} label="bash · apply update" display={`$ ${applyUpdateCommand}`} />
          <p className="text-xs text-slate-500">
            <code className="text-violet-300">apply-panel-fast-update.sh all</code> syncs the latest tarball, installs
            dependencies, runs Prisma migrations, rebuilds, and restarts PM2.
          </p>
        </FixCard>

        <FixCard title="Version shows v-- after update" icon={Terminal}>
          <p>
            A blank version means the update did not finish or the build was not swapped. Check progress, then recover
            or re-apply the update:
          </p>
          <CopyBlock text={quickRecoverCommand} label="bash · quick recover" display={`$ ${quickRecoverCommand}`} />
          <CopyBlock text={applyUpdateCommand} label="bash · re-apply update" display={`$ ${applyUpdateCommand}`} />
          <p className="text-xs text-slate-500">
            Inspect update state with{" "}
            <code className="text-violet-300">cat {PANEL_INSTALL_DIR}/.update-progress.json</code>.
          </p>
        </FixCard>

        <FixCard title="Recover from a failed or interrupted update" icon={AlertTriangle}>
          <p>
            If the panel is offline after an update, the recovery script restores the last good build or rebuilds from
            source:
          </p>
          <CopyBlock text={recoverCommand} label="bash · recover panel" display={`$ ${recoverCommand}`} />
          <p className="text-xs text-slate-500">
            Add <code className="text-violet-300">--quick</code> to skip the full rebuild and only restart/restore the
            backup.
          </p>
        </FixCard>

        <FixCard title="Fix IP login / port 80" icon={Terminal}>
          <p>
            If the login URL shows <code className="text-violet-300">:3000</code> or port 80 stops responding, re-run
            the IP-login fix script:
          </p>
          <CopyBlock text={fixIpLoginCommand} label="bash · fix IP login" display={`$ ${fixIpLoginCommand}`} />
          <p className="text-xs text-slate-500">
            Then open <code className="text-violet-300">http://YOUR_SERVER_IP/login</code> with no port number.
          </p>
        </FixCard>

        <FixCard title="Check panel health" icon={Terminal}>
          <p>Use PM2 to see process status and recent logs:</p>
          <CopyBlock text={statusCommand} label="bash · status & logs" display={`$ ${statusCommand}`} />
          <p className="text-xs text-slate-500">
            Credentials are saved in <code className="text-violet-300">/root/nexlify/install-credentials</code>.
          </p>
        </FixCard>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#12101f] p-5">
        <h4 className="text-sm font-semibold text-white">Still stuck?</h4>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Open a support ticket and include the output of{" "}
          <code className="text-violet-300">pm2 status</code>,{" "}
          <code className="text-violet-300">cat {PANEL_INSTALL_DIR}/.update-progress.json</code>, and the last 50
          lines of <code className="text-violet-300">pm2 logs nexlify</code>.
        </p>
      </div>
    </section>
  );
}
