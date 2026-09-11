import { prisma } from "@/lib/prisma";
import { decryptAtRest } from "@/lib/encryption-at-rest";
import { withSshClient, sshExec } from "@/lib/ssh-exec";
import { sanitizeVpnInterfaceName } from "@/lib/outbound-egress";
import { isThisPanelMachine } from "@/lib/panel-local-server";
import { validateVpnConfigText, type VpnKind } from "@/lib/vpn-config";
import { runVpnHealthCheckLocally } from "@/lib/vpn-tunnel-local";

export type VpnTestResult = {
  ok: boolean;
  message: string;
  checks?: { name: string; ok: boolean; detail?: string }[];
  remoteOutput?: string;
};

function buildRemoteHealthScript(profile: {
  kind: string;
  interfaceName: string;
  localHttpPort: number;
}): string {
  const kind = profile.kind === "OPENVPN" ? "OPENVPN" : "WIREGUARD";
  const iface = sanitizeVpnInterfaceName(profile.interfaceName);
  const port = Math.floor(Number(profile.localHttpPort) || 18080);
  return [
    `PORT=${port}`,
    `IFACE='${iface}'`,
    `KIND='${kind}'`,
    "OK=1",
    "MSG=''",
    `if ss -tln 2>/dev/null | grep -q ":${port} "; then echo CHECK_LISTEN=ok; else echo CHECK_LISTEN=fail; OK=0; fi`,
    `if [[ "$KIND" == "WIREGUARD" ]]; then`,
    `  if wg show "$IFACE" >/dev/null 2>&1; then echo CHECK_TUNNEL=ok; else echo CHECK_TUNNEL=fail; OK=0; fi`,
    `else`,
    `  if ip link show "$IFACE" >/dev/null 2>&1 || pgrep -f openvpn >/dev/null; then echo CHECK_TUNNEL=ok; else echo CHECK_TUNNEL=fail; OK=0; fi`,
    `fi`,
    `HTTP=$(curl -sS -m 10 -x "http://127.0.0.1:${port}/" -o /dev/null -w '%{http_code}' "http://example.com/" 2>/dev/null || echo 000)`,
    `if [[ "$HTTP" =~ ^[2345] ]]; then echo CHECK_PROXY=ok; echo PROXY_HTTP=$HTTP; else echo CHECK_PROXY=fail; echo PROXY_HTTP=$HTTP; OK=0; fi`,
    `echo VPN_TEST_OK=$OK`,
  ].join("\n");
}

function parseRemoteHealthOutput(out: string): VpnTestResult {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const listen = /CHECK_LISTEN=(\w+)/.exec(out);
  if (listen) {
    checks.push({
      name: "Local HTTP gateway listening",
      ok: listen[1] === "ok",
    });
  }
  const tunnel = /CHECK_TUNNEL=(\w+)/.exec(out);
  if (tunnel) {
    checks.push({
      name: "VPN tunnel interface",
      ok: tunnel[1] === "ok",
    });
  }
  const proxy = /CHECK_PROXY=(\w+)/.exec(out);
  const httpCode = /PROXY_HTTP=(\d+)/.exec(out);
  if (proxy) {
    checks.push({
      name: "HTTP CONNECT through VPN proxy",
      ok: proxy[1] === "ok",
      detail: httpCode ? `example.com → ${httpCode[1]}` : undefined,
    });
  }
  const ok = /VPN_TEST_OK=1/.test(out) && checks.every((c) => c.ok);
  return {
    ok,
    message: ok ? "VPN tunnel and local proxy are working" : "VPN test failed on server",
    checks,
    remoteOutput: out.slice(0, 4000),
  };
}

async function sshCredentials(server: {
  host: string;
  agentSshHost: string | null;
  agentSshUser: string | null;
  agentSshPort: number | null;
  agentSshPasswordEnc: string | null;
  agentUseSsh: boolean;
}) {
  const host = server.agentSshHost || server.host;
  const user = server.agentSshUser || "root";
  const port = server.agentSshPort || 22;
  let password = "";
  try {
    password = server.agentSshPasswordEnc ? decryptAtRest(server.agentSshPasswordEnc) : "";
  } catch {
    return { error: "Cannot decrypt SSH password" as const };
  }
  if (!password) {
    return { error: "SSH password required to test VPN on a remote LB" as const };
  }
  return { host, user, port, password };
}

/** Validate stored config and optionally run live checks on the target LB. */
export async function testVpnProfileOnServer(
  vpnProfileId: string,
  serverId?: string
): Promise<VpnTestResult> {
  const profile = await prisma.vpnProfile.findUnique({ where: { id: vpnProfileId } });
  if (!profile) return { ok: false, message: "VPN profile not found" };
  if (!profile.isActive) return { ok: false, message: "VPN profile is inactive" };

  const kind = (profile.kind === "OPENVPN" ? "OPENVPN" : "WIREGUARD") as VpnKind;
  const validation = validateVpnConfigText(kind, profile.configText);
  if (!validation.valid) {
    return {
      ok: false,
      message: validation.errors[0] ?? "Invalid VPN config",
      checks: validation.errors.map((e) => ({ name: "Config", ok: false, detail: e })),
    };
  }

  if (!serverId) {
    return {
      ok: true,
      message: "Config looks valid (no server selected for live test)",
      checks: [{ name: "Config format", ok: true }],
    };
  }

  const server = await prisma.streamServer.findUnique({ where: { id: serverId } });
  if (!server) return { ok: false, message: "Server not found" };

  if (isThisPanelMachine(server)) {
    const local = runVpnHealthCheckLocally({
      kind: profile.kind,
      interfaceName: profile.interfaceName,
      localHttpPort: profile.localHttpPort,
    });
    return {
      ok: local.ok,
      message: local.ok ? "VPN tunnel and local proxy are working (this panel host)" : local.message,
      checks: local.checks,
      remoteOutput: local.output,
    };
  }

  if (!server.agentUseSsh) {
    return {
      ok: false,
      message:
        "Enable SSH on this server to test VPN remotely, or run the panel on the LB host for local apply/test",
    };
  }

  const creds = await sshCredentials(server);
  if ("error" in creds) return { ok: false, message: creds.error };

  const script = buildRemoteHealthScript(profile);
  try {
    const result = await withSshClient(
      { host: creds.host, port: creds.port, username: creds.user, password: creds.password },
      async (client) => sshExec(client, `bash -lc ${JSON.stringify(script)}`, { timeoutMs: 45_000 })
    );
    const out = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    if (result.code !== 0 && !/VPN_TEST_OK=/.test(out)) {
      return { ok: false, message: "Remote test command failed", remoteOutput: out.slice(0, 4000) };
    }
    return parseRemoteHealthOutput(out);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "SSH test failed",
    };
  }
}
