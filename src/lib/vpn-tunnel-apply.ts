import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { decryptAtRest } from "@/lib/encryption-at-rest";
import { withSshClient, sshExec } from "@/lib/ssh-exec";
import { sanitizeVpnInterfaceName } from "@/lib/outbound-egress";
import { isThisPanelMachine } from "@/lib/panel-local-server";
import { runVpnApplyScriptLocally } from "@/lib/vpn-tunnel-local";

export type VpnApplyResult = {
  ok: boolean;
  dryRun?: boolean;
  message: string;
  remoteOutput?: string;
  local?: boolean;
};

function scriptSources() {
  const root = process.cwd();
  return {
    applySh: readFileSync(path.join(root, "scripts", "vpn-tunnel-apply.sh"), "utf8"),
    proxyJs: readFileSync(path.join(root, "scripts", "vpn-local-http-proxy.mjs"), "utf8"),
  };
}

async function updateServerAfterApply(
  serverId: string,
  profile: { id: string; name: string },
  ok: boolean,
  out: string
) {
  if (ok) {
    await prisma.streamServer.update({
      where: { id: serverId },
      data: {
        outboundMode: "VPN",
        vpnProfileId: profile.id,
        proxyId: null,
        configRevision: { increment: 1 },
        healthMessage: `VPN ${profile.name} applied`,
      },
    });
  } else {
    await prisma.streamServer.update({
      where: { id: serverId },
      data: { healthMessage: `VPN apply failed: ${out.slice(0, 200)}` },
    });
  }
}

/** Apply VPN profile on a stream server (local panel host or via SSH). */
export async function applyVpnProfileToServer(
  serverId: string,
  vpnProfileId: string,
  opts?: { dryRun?: boolean }
): Promise<VpnApplyResult> {
  const server = await prisma.streamServer.findUnique({ where: { id: serverId } });
  const profile = await prisma.vpnProfile.findUnique({ where: { id: vpnProfileId } });
  if (!server) return { ok: false, message: "Server not found" };
  if (!profile) return { ok: false, message: "VPN profile not found" };
  if (!profile.isActive) return { ok: false, message: "VPN profile is inactive" };

  if (isThisPanelMachine(server)) {
    const local = runVpnApplyScriptLocally(profile, { dryRun: opts?.dryRun });
    if (!opts?.dryRun && local.ok) {
      await prisma.streamServer.update({
        where: { id: serverId },
        data: {
          outboundMode: "VPN",
          vpnProfileId: profile.id,
          proxyId: null,
          configRevision: { increment: 1 },
          healthMessage: `VPN ${profile.name} applied (local)`,
        },
      });
    }
    return {
      ok: local.ok,
      dryRun: local.dryRun,
      message: local.message,
      remoteOutput: local.output,
      local: true,
    };
  }

  if (!server.agentUseSsh) {
    return {
      ok: false,
      message:
        "This server is not the panel host — enable SSH (agent) on the server to apply VPN remotely",
    };
  }

  const host = server.agentSshHost || server.host;
  const user = server.agentSshUser || "root";
  const port = server.agentSshPort || 22;
  let password = "";
  try {
    password = server.agentSshPasswordEnc ? decryptAtRest(server.agentSshPasswordEnc) : "";
  } catch {
    return { ok: false, message: "Cannot decrypt SSH password" };
  }
  if (!password) {
    return { ok: false, message: "SSH password required to apply VPN on remote LB" };
  }

  const iface = sanitizeVpnInterfaceName(profile.interfaceName);
  const confB64 = Buffer.from(profile.configText, "utf8").toString("base64");
  const { applySh, proxyJs } = scriptSources();
  const remoteDir = "/var/lib/nexlify/vpn-tools";
  const dry = opts?.dryRun ? "1" : "0";

  const applyB64 = Buffer.from(applySh, "utf8").toString("base64");
  const proxyB64 = Buffer.from(proxyJs, "utf8").toString("base64");

  const remoteCmd = [
    `mkdir -p ${remoteDir}`,
    `echo '${applyB64}' | base64 -d > ${remoteDir}/vpn-tunnel-apply.sh`,
    `echo '${proxyB64}' | base64 -d > ${remoteDir}/vpn-local-http-proxy.mjs`,
    `chmod +x ${remoteDir}/vpn-tunnel-apply.sh`,
    [
      `export NEXLIFY_VPN_KIND='${profile.kind}'`,
      `export NEXLIFY_VPN_IFACE='${iface}'`,
      `export NEXLIFY_VPN_LOCAL_PORT='${profile.localHttpPort}'`,
      `export NEXLIFY_VPN_DRY_RUN='${dry}'`,
      `export NEXLIFY_VPN_PROXY_JS='${remoteDir}/vpn-local-http-proxy.mjs'`,
      `export NEXLIFY_VPN_CONFIG_B64='${confB64}'`,
      `bash ${remoteDir}/vpn-tunnel-apply.sh`,
    ].join(" && "),
  ].join(" && ");

  try {
    const result = await withSshClient(
      {
        host,
        port,
        username: user,
        password,
      },
      async (client) => sshExec(client, remoteCmd, { timeoutMs: 120_000 })
    );
    const out = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    const ok = result.code === 0 && /"ok"\s*:\s*true/.test(out);
    if (!opts?.dryRun) {
      await updateServerAfterApply(serverId, profile, ok, out);
    }
    return {
      ok,
      dryRun: Boolean(opts?.dryRun),
      message: ok ? "VPN tunnel + local HTTP gateway applied" : "Remote apply failed",
      remoteOutput: out.slice(0, 4000),
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "SSH apply failed",
    };
  }
}

export { buildVpnApplyEnv } from "@/lib/outbound-egress";
