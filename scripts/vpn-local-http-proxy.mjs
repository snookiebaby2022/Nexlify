#!/usr/bin/env node
/**
 * Local HTTP CONNECT proxy for VPN egress.
 * Binds 127.0.0.1:<port> and dials origins with optional --local-ip (tunnel address).
 *
 * Usage:
 *   node scripts/vpn-local-http-proxy.mjs --port 18080 [--local-ip 10.x.x.x]
 */
import http from "node:http";
import net from "node:net";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const port = Number(arg("--port", process.env.NEXLIFY_VPN_LOCAL_PORT || "18080"));
const localIp = String(arg("--local-ip", process.env.NEXLIFY_VPN_LOCAL_IP || "")).trim() || undefined;
const bind = String(arg("--bind", "127.0.0.1"));

const server = http.createServer((req, res) => {
  res.writeHead(405, { "content-type": "text/plain" });
  res.end("CONNECT only");
});

server.on("connect", (req, clientSocket, head) => {
  const target = String(req.url || "");
  const [host, portStr] = target.split(":");
  const destPort = Number(portStr || 0);
  if (!host || !destPort) {
    clientSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    clientSocket.destroy();
    return;
  }
  const opts = { host, port: destPort };
  if (localIp) opts.localAddress = localIp;
  const upstream = net.connect(opts, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head?.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on("error", () => {
    try {
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    } catch {
      /* ignore */
    }
    clientSocket.destroy();
  });
  clientSocket.on("error", () => upstream.destroy());
});

server.listen(port, bind, () => {
  console.log(
    JSON.stringify({
      ok: true,
      bind,
      port,
      localIp: localIp || null,
      pid: process.pid,
    })
  );
});
