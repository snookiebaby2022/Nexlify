import { prisma } from "@/lib/prisma";
import {
  ffmpegHttpProxyArg as ffmpegHttpProxyArgPure,
  ffmpegProxyEnv as ffmpegProxyEnvPure,
  materializeServerOutboundProxy,
  outboundProxyToUrl,
  type OutboundProxyLike,
} from "@/lib/outbound-egress";

export type OutboundProxy = OutboundProxyLike;

/** XUI-style: egress is bound to the stream server (proxy and/or VPN profile). */
export async function resolveOutboundProxyForServer(
  serverId: string | null | undefined
): Promise<OutboundProxy | null> {
  if (!serverId) return null;
  const server = await prisma.streamServer.findUnique({
    where: { id: serverId },
    select: {
      outboundMode: true,
      proxyId: true,
      vpnProfileId: true,
      proxy: {
        select: { type: true, host: true, port: true, username: true, password: true, isActive: true },
      },
      vpnProfile: {
        select: { isActive: true, localHttpPort: true, kind: true },
      },
    },
  });
  if (!server) return null;
  return materializeServerOutboundProxy(server);
}

export function outboundProxyHeaderValue(proxy: OutboundProxy | null | undefined): string {
  return outboundProxyToUrl(proxy);
}

/** Resolve egress proxy from the stream's assigned server. */
export async function resolveOutboundProxyForStream(streamId: string): Promise<OutboundProxy | null> {
  const row = await prisma.stream.findUnique({
    where: { id: streamId },
    select: { serverId: true },
  });
  return resolveOutboundProxyForServer(row?.serverId);
}

/** ffmpeg `-http_proxy` accepts http://host:port only (not SOCKS5). */
export function ffmpegHttpProxyArg(proxy: OutboundProxy | null | undefined): string | null {
  return ffmpegHttpProxyArgPure(proxy);
}

export function ffmpegProxyEnv(proxy: OutboundProxy | null | undefined): Record<string, string> {
  return ffmpegProxyEnvPure(proxy);
}
