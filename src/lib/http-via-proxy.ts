import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { OutboundProxy } from "@/lib/outbound-proxy";
import { connectViaSocks5 } from "@/lib/socks5-connect";

/** Open a TCP socket to the origin, optionally via HTTP CONNECT or SOCKS5. */
export function connectOriginSocket(
  targetUrl: string,
  proxy: OutboundProxy | null | undefined,
  timeoutMs: number
): Promise<net.Socket> {
  const target = new URL(targetUrl);
  if (!proxy) {
    return connectDirect(target, timeoutMs);
  }

  const destPort = Number(target.port || (target.protocol === "https:" ? 443 : 80));
  if (String(proxy.type).toUpperCase() === "SOCKS5") {
    return connectViaSocks5(
      {
        host: proxy.host,
        port: proxy.port,
        username: proxy.username,
        password: proxy.password,
      },
      target.hostname,
      destPort,
      timeoutMs
    );
  }

  const connectHost = target.hostname;
  const connectPort = String(destPort);

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Host: `${connectHost}:${connectPort}`,
    };
    if (proxy.username || proxy.password) {
      headers["Proxy-Authorization"] = `Basic ${Buffer.from(`${proxy.username || ""}:${proxy.password || ""}`).toString("base64")}`;
    }

    const req = http.request({
      host: proxy.host,
      port: Number(proxy.port || (String(proxy.type).toUpperCase() === "HTTPS" ? 443 : 80)),
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

/** Issue an HTTP(S) request to origin, optionally via HTTP CONNECT or SOCKS5. */
export function requestOrigin(
  opts: OriginRequestOptions,
  onResponse: (res: http.IncomingMessage) => void
): http.ClientRequest {
  const target = new URL(opts.targetUrl);
  const method = opts.method ?? "GET";
  const lib = target.protocol === "https:" ? https : http;

  if (!opts.proxy) {
    const req = lib.request(
      opts.targetUrl,
      {
        method,
        headers: opts.headers,
        timeout: opts.timeoutMs,
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
