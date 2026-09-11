/** Soft string unions so builds work even when Prisma client lags schema. */
export type OutboundProxyLike = {
  type: "HTTP" | "HTTPS" | "SOCKS5" | string;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
  /** When true, edge must keep 127.0.0.1 (VPN local gateway). */
  allowLoopback?: boolean;
};

export type VpnProfileLike = {
  isActive: boolean;
  localHttpPort: number;
  kind?: string;
};

export type ServerEgressInput = {
  outboundMode?: string | null;
  proxyId?: string | null;
  vpnProfileId?: string | null;
  proxy?: (OutboundProxyLike & { isActive?: boolean }) | null;
  vpnProfile?: VpnProfileLike | null;
};

/** Map a VPN profile to the local HTTP CONNECT gateway the LB edge should use. */
export function vpnProfileToLocalHttpProxy(profile: VpnProfileLike): OutboundProxyLike {
  const port = Math.max(1, Math.min(65535, Number(profile.localHttpPort) || 18080));
  return {
    type: "HTTP",
    host: "127.0.0.1",
    port,
    username: null,
    password: null,
    allowLoopback: true,
  };
}

/**
 * Resolve effective egress for a stream server.
 * PROXY → assigned StreamProxy (HTTP/HTTPS/SOCKS5)
 * VPN → 127.0.0.1:localHttpPort HTTP gateway (tunnel applied separately on LB)
 * NONE / missing → null (direct)
 */
export function materializeServerOutboundProxy(server: ServerEgressInput): OutboundProxyLike | null {
  const mode = String(server.outboundMode || "NONE").toUpperCase();

  if (mode === "VPN") {
    const vpn = server.vpnProfile;
    if (!vpn?.isActive) return null;
    return vpnProfileToLocalHttpProxy(vpn);
  }

  const useProxy = mode === "PROXY" || (mode === "NONE" && Boolean(server.proxyId));
  if (useProxy) {
    const proxy = server.proxy;
    if (!proxy || proxy.isActive === false) return null;
    if (!proxy.host || !proxy.port) return null;
    return {
      type: proxy.type,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username ?? null,
      password: proxy.password ?? null,
      allowLoopback: isLoopbackHost(proxy.host),
    };
  }

  return null;
}

export function isLoopbackHost(host: string | null | undefined): boolean {
  const h = String(host || "")
    .trim()
    .toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "0.0.0.0";
}

export function outboundProxyToUrl(proxy: OutboundProxyLike | null | undefined): string {
  if (!proxy?.host || !proxy.port) return "";
  const auth =
    proxy.username && proxy.password
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : "";
  const type = String(proxy.type || "HTTP").toUpperCase();
  const scheme = type === "SOCKS5" ? "socks5" : type === "HTTPS" ? "https" : "http";
  const base = `${scheme}://${auth}${proxy.host}:${proxy.port}`;
  if (proxy.allowLoopback || isLoopbackHost(proxy.host)) {
    return `${base}/?nexlify_loopback=1`;
  }
  return base;
}

/** Prefer `socks5://host:port` or `http://host:port?nexlify_loopback=1`. */
export function parseOutboundProxyUrl(raw: string | null | undefined): OutboundProxyLike | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    const proto = u.protocol.replace(":", "").toLowerCase();
    let type: OutboundProxyLike["type"] = "HTTP";
    if (proto === "socks5" || proto === "socks") type = "SOCKS5";
    else if (proto === "https") type = "HTTPS";
    else if (proto === "http") type = "HTTP";
    else return null;
    const port = Number(u.port || (type === "HTTPS" ? 443 : type === "SOCKS5" ? 1080 : 80));
    if (!u.hostname || !Number.isFinite(port) || port < 1) return null;
    const allowLoopback =
      u.searchParams.get("nexlify_loopback") === "1" ||
      u.searchParams.get("nexlify_vpn") === "1" ||
      isLoopbackHost(u.hostname);
    return {
      type,
      host: u.hostname,
      port,
      username: u.username ? decodeURIComponent(u.username) : "",
      password: u.password ? decodeURIComponent(u.password) : "",
      allowLoopback,
    };
  } catch {
    return null;
  }
}

/** ffmpeg `-http_proxy` only works for HTTP proxies. */
export function ffmpegHttpProxyArg(proxy: OutboundProxyLike | null | undefined): string | null {
  if (!proxy || String(proxy.type).toUpperCase() === "SOCKS5") return null;
  const auth =
    proxy.username && proxy.password
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : "";
  return `http://${auth}${proxy.host}:${proxy.port}`;
}

/** Env vars for ffmpeg / child processes (SOCKS via ALL_PROXY when supported). */
export function ffmpegProxyEnv(proxy: OutboundProxyLike | null | undefined): Record<string, string> {
  if (!proxy?.host || !proxy.port) return {};
  const auth =
    proxy.username && proxy.password
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : "";
  const type = String(proxy.type).toUpperCase();
  if (type === "SOCKS5") {
    const url = `socks5://${auth}${proxy.host}:${proxy.port}`;
    return { ALL_PROXY: url, all_proxy: url };
  }
  const url = `http://${auth}${proxy.host}:${proxy.port}`;
  return { http_proxy: url, HTTP_PROXY: url, https_proxy: url, HTTPS_PROXY: url };
}

export function sanitizeVpnInterfaceName(name: string | null | undefined, fallback = "wg-nexlify0"): string {
  const cleaned = String(name || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 15);
  return cleaned || fallback;
}

/** Env vars for scripts/vpn-tunnel-apply.sh (unit-testable, no SSH). */
export function buildVpnApplyEnv(profile: {
  kind: string;
  interfaceName: string;
  localHttpPort: number;
  configText: string;
}): Record<string, string> {
  return {
    NEXLIFY_VPN_KIND: profile.kind,
    NEXLIFY_VPN_IFACE: sanitizeVpnInterfaceName(profile.interfaceName),
    NEXLIFY_VPN_LOCAL_PORT: String(profile.localHttpPort),
    NEXLIFY_VPN_CONFIG_B64: Buffer.from(profile.configText, "utf8").toString("base64"),
  };
}

export function normalizeOutboundMode(
  mode: string | null | undefined,
  hasProxy: boolean,
  hasVpn: boolean
): "NONE" | "PROXY" | "VPN" {
  const m = String(mode || "").toUpperCase();
  if (m === "VPN" && hasVpn) return "VPN";
  if (m === "PROXY" && hasProxy) return "PROXY";
  if (m === "VPN") return hasVpn ? "VPN" : "NONE";
  if (m === "PROXY") return hasProxy ? "PROXY" : "NONE";
  if (hasProxy) return "PROXY";
  if (hasVpn) return "VPN";
  return "NONE";
}
