#!/usr/bin/env node
/**
 * IPTV edge proxy — accepts Host headers like "http://1.2.3.4" / "https://host:443"
 * that nginx rejects with 400, sanitizes them, and forwards to the panel.
 *
 * Usage:
 *   node scripts/iptv-edge-proxy.mjs
 * Env:
 *   IPTV_EDGE_BACKEND=127.0.0.1:80
 *   IPTV_EDGE_HTTP_PORTS=8080,25461
 *   IPTV_EDGE_HTTPS_PORTS=443
 *   IPTV_EDGE_CERT=/etc/nginx/ssl/nexlify-panel/fullchain.pem
 *   IPTV_EDGE_KEY=/etc/nginx/ssl/nexlify-panel/privkey.pem
 */
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import { URL } from "node:url";

const BACKEND = process.env.IPTV_EDGE_BACKEND || "127.0.0.1:80";
const [backendHost, backendPortRaw] = BACKEND.split(":");
const backendPort = Number(backendPortRaw || 80);

function parsePorts(raw, fallback) {
  const s = (raw ?? fallback ?? "").trim();
  if (!s) return [];
  return [...new Set(s.split(/[,\s]+/).map((p) => Number(p)).filter((n) => n > 0 && n < 65536))];
}

/** Same rules as src/lib/public-origin.parseRequestHostHeader */
function sanitizeHostHeader(raw) {
  let t = String(raw ?? "").trim();
  if (!t) return "";
  t = t.replace(/^https?:\/\//i, "");
  t = t.split("/")[0]?.split("?")[0]?.split("#")[0] ?? t;
  t = t.trim();
  if (t.startsWith("[")) {
    const m = t.match(/^\[([^\]]+)](?::(\d{1,5}))?$/i);
    if (m) return m[2] ? `[${m[1]}]:${m[2]}` : m[1];
  }
  return t;
}

function forward(clientReq, clientRes, { listenPort, proto }) {
  const cleanHost = sanitizeHostHeader(clientReq.headers.host) || backendHost;
  const headers = { ...clientReq.headers };
  headers.host = cleanHost;
  headers["x-forwarded-host"] = cleanHost.split(":")[0];
  headers["x-forwarded-proto"] = proto;
  headers["x-forwarded-port"] = String(listenPort);
  headers["x-nexlify-client-port"] = String(listenPort);
  headers["x-forwarded-for"] = clientReq.socket.remoteAddress || "";
  const proxyReq = http.request(
    {
      hostname: backendHost,
      port: backendPort,
      path: clientReq.url,
      method: clientReq.method,
      headers,
      timeout: 300_000,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(clientRes);
    }
  );
  proxyReq.on("error", (err) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "content-type": "text/plain" });
    }
    clientRes.end(`iptv-edge proxy error: ${err.message}`);
  });
  clientReq.pipe(proxyReq);
}

function listenHttp(port) {
  const server = http.createServer((req, res) =>
    forward(req, res, { listenPort: port, proto: "http" })
  );
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`[iptv-edge] http://0.0.0.0:${port} → ${BACKEND}`);
  });
  server.on("error", (err) => {
    console.error(`[iptv-edge] http :${port} failed:`, err.message);
    process.exitCode = 1;
  });
  return server;
}

function listenHttps(port, cert, key) {
  const server = https.createServer({ cert, key }, (req, res) =>
    forward(req, res, { listenPort: port, proto: "https" })
  );
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`[iptv-edge] https://0.0.0.0:${port} → ${BACKEND}`);
  });
  server.on("error", (err) => {
    console.error(`[iptv-edge] https :${port} failed:`, err.message);
    process.exitCode = 1;
  });
  return server;
}

const httpPorts = parsePorts(process.env.IPTV_EDGE_HTTP_PORTS, "8080,25461");
const httpsPorts = parsePorts(process.env.IPTV_EDGE_HTTPS_PORTS, "443");
const certPath = process.env.IPTV_EDGE_CERT || "/etc/nginx/ssl/nexlify-panel/fullchain.pem";
const keyPath = process.env.IPTV_EDGE_KEY || "/etc/nginx/ssl/nexlify-panel/privkey.pem";

for (const p of httpPorts) listenHttp(p);

if (httpsPorts.length) {
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.error(`[iptv-edge] missing TLS cert/key at ${certPath} / ${keyPath}`);
    process.exit(1);
  }
  const cert = fs.readFileSync(certPath);
  const key = fs.readFileSync(keyPath);
  for (const p of httpsPorts) listenHttps(p, cert, key);
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
