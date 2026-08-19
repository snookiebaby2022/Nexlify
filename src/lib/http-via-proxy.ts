import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { OutboundProxy } from "@/lib/outbound-proxy";
import { proxyUrl } from "@/lib/proxy";

function basicAuthHeader(proxy: URL): string | undefined {
  if (proxy.username || proxy.password) {
    const user = decodeURIComponent(proxy.username);
    const pass = decodeURIComponent(proxy.password);
    return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  }
  return undefined;
}

/** Open a TCP socket to the origin, optionally via HTTP CONNECT proxy (XUI egress proxy). */
export function connectOriginSocket(
  targetUrl: string,
  proxy: OutboundProxy | null | undefined,
  timeoutMs: number
): Promise<net.Socket> {
  const target = new URL(targetUrl);
  if (!proxy || proxy.type === "SOCKS5") {
    return connectDirect(target, timeoutMs);
  }

  const proxyUrlParsed = new URL(proxyUrl(proxy));
  const connectHost = target.hostname;
  const connectPort = target.port || (target.protocol === "https:" ? "443" : "80");

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Host: `${connectHost}:${connectPort}`,
    };
    const auth = basicAuthHeader(proxyUrlParsed);
    if (auth) headers["Proxy-Authorization"] = auth;

    const req = http.request({
      host: proxyUrlParsed.hostname,
      port: Number(proxyUrlParsed.port || (proxy.type === "HTTPS" ? 443 : 80)),
      method: "CONNECT",
      path: `${connectHost}:${connectPort}`,
      headers,
      timeout: timeoutMs,
    });

    req.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT HTTP ${res.statusCode}`));
        return;
      }
      socket.setTimeout(0);
      resolve(socket);
    });
    req.on("timeout", () => req.destroy(new Error("Proxy CONNECT timeout")));
    req.on("error", reject);
    req.end();
  });
}

function connectDirect(target: URL, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const port = Number(target.port || (target.protocol === "https:" ? 443 : 80));
    const socket = net.connect({ host: target.hostname, port, timeout: timeoutMs });
    socket.once("connect", () => {
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("Direct connect timeout"));
    });
  });
}

export type OriginRequestOptions = {
  targetUrl: string;
  proxy?: OutboundProxy | null;
  headers: Record<string, string>;
  timeoutMs: number;
  method?: string;
};

/** Issue an HTTP(S) request to origin, optionally via HTTP CONNECT proxy. */
export function requestOrigin(
  opts: OriginRequestOptions,
  onResponse: (res: http.IncomingMessage) => void
): http.ClientRequest {
  const target = new URL(opts.targetUrl);
  const method = opts.method ?? "GET";
  const lib = target.protocol === "https:" ? https : http;

  if (!opts.proxy || opts.proxy.type === "SOCKS5") {
    const req = lib.request(
      opts.targetUrl,
      {
        method,
        headers: opts.headers,
        timeout: opts.timeoutMs,
        ...(target.protocol === "https:" ? { rejectUnauthorized: false } : {}),
      },
      onResponse
    );
    req.on("timeout", () => req.destroy(new Error("Upstream timeout")));
    return req;
  }

  const req = lib.request(
    {
      hostname: target.hostname,
      port: String(Number(target.port || (target.protocol === "https:" ? 443 : 80))),
      method,
      path: `${target.pathname}${target.search}`,
      headers: {
        ...opts.headers,
        Host: target.host,
      },
      timeout: opts.timeoutMs,
      rejectUnauthorized: false,
      createConnection: (_connOpts, cb) => {
        void connectOriginSocket(opts.targetUrl, opts.proxy, opts.timeoutMs)
          .then((socket) => cb(null, socket))
          .catch((err) => cb(err as Error, undefined as unknown as net.Socket));
        return undefined;
      },
    },
    onResponse
  );
  req.on("timeout", () => req.destroy(new Error("Upstream timeout")));
  return req;
}
