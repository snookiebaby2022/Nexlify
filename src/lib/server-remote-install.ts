import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateAgentToken } from "@/lib/stream-agent";
import { encodeSshPasswordOrThrow, serverGeoFields } from "@/lib/server-save-fields";
import { STREAM_HTTP_PORT, STREAM_HTTPS_PORT, PANEL_HTTP_PORT } from "@/lib/server-ports";
import { assertCanCreateMainServer } from "@/lib/plan-limits";
import { isLocalPanelHost } from "@/lib/panel-local-server";
import { testStreamServerSsh } from "@/lib/ssh-server-test";
import { shQuote, sshExec, withSshClient } from "@/lib/ssh-exec";
import { detectHardwareOverSsh } from "@/lib/ssh-remote-detect";
import { detectServerHardware, type DetectedHardware } from "@/lib/server-hardware";
import {
  buildServerPanelSettingsJson,
  defaultAdvancedSettings,
  defaultNetworkSettings,
  defaultPerformanceSettings,
  defaultSslSettings,
  parseServerPanelSettings,
} from "@/lib/server-panel-settings";
import {
  appendInstallLog,
  completeInstallJob,
  failInstallJob,
  setInstallStep,
} from "@/lib/server-install-job";

export type RemoteInstallInput = {
  panelUrl: string;
  host: string;
  serverName: string;
  sshPort: string;
  sshUser: string;
  sshPassword: string;
  updateSysctl: boolean;
};

function scrub(text: string, secrets: string[]) {
  let out = text;
  for (const s of secrets) {
    if (s && s.length > 4) out = out.split(s).join("[redacted]");
  }
  return out;
}

function hardwareToSettings(hw: DetectedHardware, updateSysctl: boolean) {
  const network = {
    ...defaultNetworkSettings(),
    interfaceName: hw.primaryInterface || "eth0",
    gateway: hw.gateway || "",
  };
  const performance = {
    ...defaultPerformanceSettings(),
    cpuThreads: hw.cpuThreads,
    maxConnections: hw.suggestedMaxConnections,
    ioReadMbps: hw.suggestedIoReadMbps,
    ioWriteMbps: hw.suggestedIoWriteMbps,
    bufferSizeMb: hw.suggestedBufferMb,
    sysctlConf: updateSysctl
      ? [
          "fs.file-max = 2097152",
          "net.core.somaxconn = 65535",
          "net.ipv4.ip_local_port_range = 1024 65535",
          "net.ipv4.tcp_fin_timeout = 15",
          "net.ipv4.tcp_tw_reuse = 1",
        ].join("\n")
      : "",
  };
  return buildServerPanelSettingsJson(null, {
    network,
    performance,
    advanced: { ...defaultAdvancedSettings(), serverRole: "lb" },
    ssl: defaultSslSettings(),
  });
}

function sysctlSnippet(conf: string) {
  return `
cat > /etc/sysctl.d/99-nexlify.conf <<'NEXLIFY_SYSCTL'
${conf}
NEXLIFY_SYSCTL
sysctl --system >/dev/null 2>&1 || sysctl -p /etc/sysctl.d/99-nexlify.conf >/dev/null 2>&1 || true
echo "[nexlify] sysctl applied (reboot still recommended for file-max)"
`;
}

function loadInstallScript(): string {
  const scriptPath = path.join(process.cwd(), "scripts", "nexlify-server-install.sh");
  if (fs.existsSync(scriptPath)) return fs.readFileSync(scriptPath, "utf8");
  throw new Error("Install script missing on the panel (scripts/nexlify-server-install.sh)");
}

async function upsertStreamServer(opts: {
  name: string;
  host: string;
  token: string;
  sshPort: number;
  sshUser: string;
  password: string;
  hw: DetectedHardware;
  updateSysctl: boolean;
}) {
  const geo = await serverGeoFields(opts.host);
  const agentSshPasswordEnc = encodeSshPasswordOrThrow(opts.password);
  const panelSettings = hardwareToSettings(opts.hw, opts.updateSysctl) as Prisma.InputJsonValue;
  const existing = await prisma.streamServer.findFirst({
    where: { host: opts.host },
    select: { id: true, panelSettings: true },
  });

  const data = {
    name: opts.name,
    host: opts.host,
    port: STREAM_HTTP_PORT,
    protocol: "http" as const,
    maxClients: opts.hw.suggestedMaxConnections,
    isActive: true,
    panelPort: PANEL_HTTP_PORT,
    httpsPort: STREAM_HTTPS_PORT,
    privateIp: opts.hw.ipv4[0] || null,
    region: geo.region,
    countryCode: geo.countryCode,
    healthStatus: "online",
    healthMessage: "SSH reachable — waiting for stream agent",
    lastHealthAt: new Date(),
    agentToken: opts.token,
    agentSshHost: opts.host,
    agentSshPort: opts.sshPort,
    agentSshUser: opts.sshUser,
    agentSshPasswordEnc,
    agentUseSsh: true,
    panelSettings,
  };

  if (existing) {
    const parsed = parseServerPanelSettings(existing.panelSettings);
    const merged = buildServerPanelSettingsJson(existing.panelSettings, {
      network: {
        ...parsed.network,
        interfaceName: opts.hw.primaryInterface || parsed.network.interfaceName,
        gateway: opts.hw.gateway || parsed.network.gateway,
      },
      performance: {
        ...parsed.performance,
        cpuThreads: opts.hw.cpuThreads || parsed.performance.cpuThreads,
        maxConnections: opts.hw.suggestedMaxConnections,
      },
      advanced: parsed.advanced,
      ssl: parsed.ssl,
    }) as Prisma.InputJsonValue;
    return prisma.streamServer.update({
      where: { id: existing.id },
      data: { ...data, name: opts.name, panelSettings: merged },
    });
  }

  const limitErr = await assertCanCreateMainServer();
  if (limitErr) throw new Error(limitErr);
  return prisma.streamServer.create({ data });
}

export async function runRemoteServerInstall(jobId: string, input: RemoteInstallInput) {
  const host = input.host.trim();
  const sshPort = String(input.sshPort || "22").trim() || "22";
  const sshUser = String(input.sshUser || "root").trim() || "root";
  const password = input.sshPassword;
  const panelUrl = input.panelUrl.replace(/\/$/, "");
  const secrets = [password];

  const log = (line: string) => appendInstallLog(jobId, scrub(line, secrets));

  try {
    if (!host) throw new Error("Server IP is required");
    if (!password) throw new Error("SSH password is required so the panel can install on the VPS");
    if (!panelUrl) throw new Error("Panel URL is required");

    setInstallStep(jobId, "Checking SSH login…", 8);
    log(`Connecting to ${sshUser}@${host}:${sshPort}`);
    const ssh = await testStreamServerSsh({
      host,
      port: Number(sshPort) || 22,
      username: sshUser,
      password,
    });
    if (!ssh.ok) throw new Error(ssh.message);
    log(ssh.message);

    setInstallStep(jobId, "Detecting primary network interface…", 18);
    let hw: DetectedHardware;
    if (isLocalPanelHost(host)) {
      hw = detectServerHardware();
      log(`This is the panel host — using local NIC ${hw.primaryInterface}`);
    } else {
      hw = await withSshClient({ host, port: Number(sshPort) || 22, username: sshUser, password }, (client) =>
        detectHardwareOverSsh(client)
      );
      log(
        `Detected interface ${hw.primaryInterface}` +
          (hw.gateway ? ` gateway ${hw.gateway}` : "") +
          (hw.ipv4[0] ? ` ip ${hw.ipv4[0]}` : "") +
          ` (${hw.cpuThreads} threads)`
      );
    }

    setInstallStep(jobId, "Saving server in the panel…", 28);
    const token = generateAgentToken();
    secrets.push(token);
    const server = await upsertStreamServer({
      name: input.serverName.trim() || "Stream-1",
      host,
      token,
      sshPort: Number(sshPort) || 22,
      sshUser,
      password,
      hw,
      updateSysctl: input.updateSysctl,
    });
    log(`Server record ${server.name} (${server.id}) — marked online after SSH`);

    const installCommand = `curl -fsSL ${panelUrl}/scripts/nexlify-server-install.sh | sudo PANEL_URL="${panelUrl}" AGENT_TOKEN="${token}" bash`;

    if (isLocalPanelHost(host)) {
      setInstallStep(jobId, "Panel host already running — skipping remote package install", 90);
      log("Skipped apt/nginx on the panel machine. Agent token is stored on this server row.");
      completeInstallJob(jobId, {
        serverId: server.id,
        serverName: server.name,
        host,
        agentToken: token,
        panelUrl,
        installCommand,
        primaryInterface: hw.primaryInterface,
        online: true,
      });
      return;
    }

    setInstallStep(jobId, "Installing nginx, FFmpeg, and the stream agent…", 35);
    log("Uploading bootstrap script over SSH (this can take several minutes)…");
    let script = loadInstallScript();
    if (input.updateSysctl) {
      const parsed = parseServerPanelSettings(server.panelSettings);
      script += sysctlSnippet(parsed.performance.sysctlConf);
    }
    const wrapped = `export PANEL_URL=${shQuote(panelUrl)}\nexport AGENT_TOKEN=${shQuote(token)}\nexport DEBIAN_FRONTEND=noninteractive\n${script}\n`;

    let installProgress = 36;
    let lastShown = 36;
    const result = await withSshClient(
      { host, port: Number(sshPort) || 22, username: sshUser, password },
      (client) =>
        sshExec(client, "bash -s", {
          stdin: wrapped,
          timeoutMs: 12 * 60_000,
          onData: (chunk) => {
            log(chunk);
            installProgress = Math.min(84, installProgress + 0.35);
            const shown = Math.floor(installProgress);
            if (shown > lastShown) {
              lastShown = shown;
              setInstallStep(jobId, "Installing packages on the VPS…", shown);
            }
          },
        })
    );
    if (result.code !== 0) {
      throw new Error(
        `Remote install exited ${result.code}. ${result.stderr.slice(-400) || result.stdout.slice(-400)}`
      );
    }
    log("Remote bootstrap finished");

    setInstallStep(jobId, "Waiting for stream agent heartbeat…", 88);
    let agentOnline = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const row = await prisma.streamServer.findUnique({
        where: { id: server.id },
        select: { agentLastSeen: true, healthStatus: true },
      });
      if (row?.agentLastSeen) {
        agentOnline = true;
        log("Agent heartbeat received — server is online");
        break;
      }
      setInstallStep(jobId, "Waiting for stream agent heartbeat…", 88 + i * 0.5);
    }
    if (!agentOnline) {
      log("SSH install finished but the agent has not checked in yet. It usually appears within a minute.");
    }

    completeInstallJob(jobId, {
      serverId: server.id,
      serverName: server.name,
      host,
      agentToken: token,
      panelUrl,
      installCommand,
      primaryInterface: hw.primaryInterface,
      online: true,
      agentOnline,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Install failed";
    log(`ERROR: ${message}`);
    failInstallJob(jobId, message);
  }
}
