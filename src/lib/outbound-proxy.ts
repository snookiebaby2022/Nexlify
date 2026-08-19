import type { StreamProxy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { proxyUrl } from "@/lib/proxy";

export type OutboundProxy = Pick<StreamProxy, "type" | "host" | "port" | "username" | "password">;

/** XUI-style: egress proxy is bound to the stream server (servers.proxy_id). */
export async function resolveOutboundProxyForServer(
  serverId: string | null | undefined
): Promise<OutboundProxy | null> {
  if (!serverId) return null;
  const server = await prisma.streamServer.findUnique({
    where: { id: serverId },
    select: {
      proxy: {
        select: { type: true, host: true, port: true, username: true, password: true, isActive: true },
      },
    },
  });
  const proxy = server?.proxy;
  if (!proxy?.isActive || !proxy.host || !proxy.port) return null;
  if (proxy.type === "SOCKS5") return null;
  return proxy;
}

export function outboundProxyHeaderValue(proxy: OutboundProxy | null | undefined): string {
  if (!proxy) return "";
  return proxyUrl(proxy);
}

/** Resolve egress proxy from the stream's assigned server (XUI servers.proxy_id). */
export async function resolveOutboundProxyForStream(streamId: string): Promise<OutboundProxy | null> {
  const row = await prisma.stream.findUnique({
    where: { id: streamId },
    select: { serverId: true },
  });
  return resolveOutboundProxyForServer(row?.serverId);
}

/** ffmpeg `-http_proxy` accepts http://host:port only. */
export function ffmpegHttpProxyArg(proxy: OutboundProxy | null | undefined): string | null {
  if (!proxy || proxy.type === "SOCKS5") return null;
  const auth =
    proxy.username && proxy.password
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : "";
  return `http://${auth}${proxy.host}:${proxy.port}`;
}
