import { spawnSync } from "node:child_process";
import path from "node:path";
import { buildVpnApplyEnv, sanitizeVpnInterfaceName } from "@/lib/outbound-egress";

export type VpnLocalApplyResult = {
  ok: boolean;
  message: string;
  output?: string;
  dryRun?: boolean;
};

export function runVpnApplyScriptLocally(
  profile: {
    kind: string;
    interfaceName: string;
    localHttpPort: number;
    configText: string;
  },
  opts?: { dryRun?: boolean }
): VpnLocalApplyResult {
  const root = process.cwd();
  const script = path.join(root, "scripts", "vpn-tunnel-apply.sh");
  const proxyJs = path.join(root, "scripts", "vpn-local-http-proxy.mjs");
  const env = {
    ...process.env,
    ...buildVpnApplyEnv({
      kind: profile.kind === "OPENVPN" ? "OPENVPN" : "WIREGUARD",
      interfaceName: profile.interfaceName,
      localHttpPort: profile.localHttpPort,
      configText: profile.configText,
    }),
    NEXLIFY_VPN_DRY_RUN: opts?.dryRun ? "1" : "0",
    NEXLIFY_VPN_PROXY_JS: proxyJs,
  };
  const result = spawnSync("bash", [script], {
    env,
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const out = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  const ok = result.status === 0 && /"ok"\s*:\s*true/.test(out);
  return {
    ok,
    dryRun: Boolean(opts?.dryRun),
    message: ok
      ? opts?.dryRun
        ? "Dry-run OK on this host"
        : "VPN tunnel + local HTTP gateway applied on this host"
      : "Local apply failed",
    output: out.slice(0, 4000),
  };
}

export function runVpnHealthCheckLocally(profile: {
  kind: string;
  interfaceName: string;
  localHttpPort: number;
}): {
  ok: boolean;
  message: string;
  checks: { name: string; ok: boolean; detail?: string }[];
  output: string;
} {
  const iface = sanitizeVpnInterfaceName(profile.interfaceName);
  const port = Math.floor(Number(profile.localHttpPort) || 18080);
  const kind = profile.kind === "OPENVPN" ? "OPENVPN" : "WIREGUARD";
  const checks: { name: string; ok: boolean; detail?: string }[] = [];

  const ss = spawnSync("bash", ["-lc", `ss -tln 2>/dev/null | grep -q ":${port} "`], {
    encoding: "utf8",
    timeout: 10_000,
  });
  const listenOk = ss.status === 0;
  checks.push({ name: "Local HTTP gateway listening", ok: listenOk, detail: `127.0.0.1:${port}` });

  let tunnelOk = false;
  if (kind === "WIREGUARD") {
    const wg = spawnSync("wg", ["show", iface], { encoding: "utf8", timeout: 10_000 });
    tunnelOk = wg.status === 0 && Boolean(wg.stdout?.trim());
    checks.push({
      name: "WireGuard interface",
      ok: tunnelOk,
      detail: tunnelOk ? wg.stdout.split("\n")[0]?.trim() : wg.stderr?.trim() || iface,
    });
  } else {
    const ovpn = spawnSync(
      "bash",
      ["-lc", `ip link show "${iface}" 2>/dev/null || pgrep -af openvpn | head -1`],
      { encoding: "utf8", timeout: 10_000 }
    );
    tunnelOk = ovpn.status === 0 && Boolean(ovpn.stdout?.trim());
    checks.push({ name: "OpenVPN process/interface", ok: tunnelOk });
  }

  const curl = spawnSync(
    "bash",
    [
      "-lc",
      `curl -sS -m 10 -x "http://127.0.0.1:${port}/" -o /dev/null -w '%{http_code}' "http://example.com/"`,
    ],
    { encoding: "utf8", timeout: 15_000 }
  );
  const code = (curl.stdout || "").trim();
  const proxyOk = /^[2345]\d{2}$/.test(code);
  checks.push({
    name: "HTTP CONNECT through VPN proxy",
    ok: proxyOk,
    detail: code ? `example.com → ${code}` : curl.stderr?.trim() || "no response",
  });

  const ok = listenOk && tunnelOk && proxyOk;
  const output = [ss.stderr, curl.stderr].filter(Boolean).join("\n").slice(0, 2000);
  return {
    ok,
    message: ok ? "VPN tunnel and local proxy are working" : "VPN health check failed on this host",
    checks,
    output,
  };
}
