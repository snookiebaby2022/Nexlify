import type { StreamProxy } from "@prisma/client";

export function proxyUrl(proxy: Pick<StreamProxy, "type" | "host" | "port" | "username" | "password">) {
  const auth =
    proxy.username && proxy.password
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : "";
  const scheme = proxy.type === "SOCKS5" ? "socks5" : proxy.type === "HTTPS" ? "https" : "http";
  return `${scheme}://${auth}${proxy.host}:${proxy.port}`;
}

export async function fetchWithOptionalProxy(
  url: string,
  proxy?: Pick<StreamProxy, "type" | "host" | "port" | "username" | "password"> | null,
  init?: RequestInit
) {
  if (!proxy) {
    return fetch(url, init);
  }
  // Node fetch does not support socks natively without undici dispatcher — use direct fetch for HTTP proxies via env in production (nginx). Panel stores proxy for FFmpeg/MAG/Stalker clients.
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      "X-Nexlify-Proxy": proxyUrl(proxy),
    },
  });
}
