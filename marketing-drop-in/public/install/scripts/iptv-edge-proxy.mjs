#!/usr/bin/env node
/**
 * IPTV edge — Host sanitizer + XUI-style live/VOD byte pipe.
 *
 * Xtream apps hit :80/:8080/:25461. Auth stays on the panel; MPEG-TS/MP4 is
 * fetched from stream_source with a VLC UA so the origin sees the panel IP.
 *
 * Env:
 *   IPTV_EDGE_BACKEND=127.0.0.1:13000
 *   IPTV_EDGE_HTTP_PORTS=80,8080,25461
 *   IPTV_EDGE_HTTPS_PORTS=
 *   PANEL_INTERNAL_SECRET=...
 */
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  const file = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
  }
}
loadDotEnv();

const BACKEND = process.env.IPTV_EDGE_BACKEND || "127.0.0.1:80";
const [backendHost, backendPortRaw] = BACKEND.split(":");
const backendPort = Number(backendPortRaw || 80);
const INTERNAL_SECRET =
  process.env.PANEL_INTERNAL_SECRET ||
  process.env.NEXLIFY_PANEL_API_SECRET ||
  process.env.PANEL_API_SECRET ||
  "";
const UPSTREAM_UA = "VLC/3.0.20 LibVLC/3.0.20";
const PLAYBACK_RE = /^\/(live|movie|series)\//;
const HLS_RE = /\.m3u8(?:[?#]|$)/i;

function parsePorts(raw, fallback) {
  const s = (raw ?? fallback ?? "").trim();
  if (!s) return [];
  return [...new Set(s.split(/[,\s]+/).map((p) => Number(p)).filter((n) => n > 0 && n < 65536))];
}

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

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "";
}

function shouldSplice(req) {
  const pathOnly = String(req.url || "/").split("?")[0];
  if (!PLAYBACK_RE.test(pathOnly)) return false;
  if (HLS_RE.test(pathOnly) || /\/hls\//i.test(pathOnly)) return false;
  return true;
}

function forward(clientReq, clientRes, { listenPort, proto }) {
  const cleanHost = sanitizeHostHeader(clientReq.headers.host) || backendHost;
  const headers = { ...clientReq.headers };
  headers.host = cleanHost;
  headers["x-forwarded-host"] = cleanHost.split(":")[0];
  headers["x-forwarded-proto"] = proto;
  headers["x-forwarded-port"] = String(listenPort);
  headers["x-nexlify-client-port"] = String(listenPort);
  headers["x-forwarded-for"] = clientIp(clientReq);
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

function liveTsHeaders() {
  return {
    "Content-Type": "video/mp2t",
    "Cache-Control": "no-cache, no-store, no-transform",
    Connection: "keep-alive",
    "Accept-Ranges": "none",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  };
}

function authLive(clientReq) {
  return new Promise((resolve, reject) => {
    const headers = {
      "x-original-uri": clientReq.url || "/",
      "x-original-method": clientReq.method || "GET",
      "x-panel-internal-secret": INTERNAL_SECRET,
      "x-forwarded-for": clientIp(clientReq),
      "x-real-ip": clientIp(clientReq),
      "user-agent": clientReq.headers["user-agent"] || "",
      connection: "close",
    };
    const req = http.request(
      {
        hostname: backendHost,
        port: backendPort,
        path: "/api/internal/live-auth",
        method: "GET",
        headers,
        timeout: 15_000,
      },
      (res) => {
        res.resume();
        resolve({
          status: res.statusCode || 502,
          upstream: String(res.headers["x-nexlify-upstream"] || ""),
          live: String(res.headers["x-nexlify-live"] || "") === "1",
          passthrough: String(res.headers["x-nexlify-passthrough"] || "") === "1" || res.statusCode === 204,
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("live-auth timeout")));
    req.on("error", reject);
    req.end();
  });
}

function pipeUpstream(targetUrl, clientReq, clientRes, { live, redirectsLeft, listenPort, proto }) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    clientRes.writeHead(502, { "content-type": "text/plain" });
    clientRes.end("Invalid upstream");
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    clientRes.writeHead(502, { "content-type": "text/plain" });
    clientRes.end("Unsupported upstream");
    return;
  }
  const lib = parsed.protocol === "https:" ? https : http;
  const headers = {
    "User-Agent": UPSTREAM_UA,
    Accept: "*/*",
    Connection: "keep-alive",
    "Icy-MetaData": "0",
  };
  if (!live && clientReq.headers.range) headers.Range = clientReq.headers.range;
  const opts = {
    method: "GET",
    headers,
    timeout: 300_000,
  };
  if (parsed.protocol === "https:") opts.rejectUnauthorized = false;

  const up = lib.request(parsed, opts, (upRes) => {
    const status = upRes.statusCode || 0;
    const loc = upRes.headers.location;
    if (status >= 300 && status < 400 && loc && redirectsLeft > 0) {
      upRes.resume();
      let next;
      try {
        next = new URL(loc, parsed).toString();
      } catch {
        clientRes.writeHead(502, { "content-type": "text/plain" });
        clientRes.end("Bad upstream redirect");
        return;
      }
      pipeUpstream(next, clientReq, clientRes, { live, redirectsLeft: redirectsLeft - 1, listenPort, proto });
      return;
    }
    if (live) {
      const ct = String(upRes.headers["content-type"] || "").toLowerCase();
      const loc = String(upRes.headers.location || "");
      if (/mpegurl|x-mpegurl/.test(ct) || /\.m3u8/i.test(loc)) {
        upRes.resume();
        up.destroy();
        forward(clientReq, clientRes, { listenPort, proto });
        return;
      }
      let sent = false;
      upRes.once("data", (chunk) => {
        const head = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (head.subarray(0, 7).toString("ascii") === "#EXTM3U") {
          up.destroy();
          if (!clientRes.headersSent) forward(clientReq, clientRes, { listenPort, proto });
          return;
        }
        sent = true;
        clientRes.writeHead(200, liveTsHeaders());
        clientRes.write(head);
        upRes.pipe(clientRes);
      });
      upRes.once("end", () => {
        if (!sent && !clientRes.headersSent) {
          clientRes.writeHead(502, { "content-type": "text/plain" });
          clientRes.end("Empty upstream");
        }
      });
      return;
    }
    clientRes.writeHead(status || 502, upRes.headers);
    upRes.pipe(clientRes);
  });
  up.on("timeout", () => up.destroy(new Error("upstream timeout")));
  up.on("error", (err) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "content-type": "text/plain" });
    }
    clientRes.end(`upstream error: ${err.message}`);
  });
  clientReq.on("close", () => up.destroy());
  up.end();
}

async function onRequest(clientReq, clientRes, ctx) {
  if (clientReq.method === "OPTIONS" && shouldSplice(clientReq)) {
    clientRes.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, User-Agent, Accept, Range",
    });
    clientRes.end();
    return;
  }
  if (!shouldSplice(clientReq)) {
    forward(clientReq, clientRes, ctx);
    return;
  }
  if (!INTERNAL_SECRET) {
    forward(clientReq, clientRes, ctx);
    return;
  }
  try {
    const auth = await authLive(clientReq);
    if (auth.passthrough || !auth.upstream) {
      forward(clientReq, clientRes, ctx);
      return;
    }
    if (auth.status === 401 || auth.status === 403 || auth.status === 429) {
      clientRes.writeHead(auth.status, { "content-type": "text/plain" });
      clientRes.end(auth.status === 401 ? "Unauthorized" : "Forbidden");
      return;
    }
    if (auth.status !== 200) {
      forward(clientReq, clientRes, ctx);
      return;
    }
    if (clientReq.method === "HEAD") {
      clientRes.writeHead(200, auth.live ? liveTsHeaders() : { "Content-Type": "video/mp4", "Access-Control-Allow-Origin": "*" });
      clientRes.end();
      return;
    }
    pipeUpstream(auth.upstream, clientReq, clientRes, { live: auth.live, redirectsLeft: 5, ...ctx });
  } catch {
    forward(clientReq, clientRes, ctx);
  }
}

function listenHttp(port) {
  const server = http.createServer((req, res) => onRequest(req, res, { listenPort: port, proto: "http" }));
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`[iptv-edge] http://0.0.0.0:${port} → ${BACKEND} (live splice on)`);
  });
  server.on("error", (err) => {
    console.error(`[iptv-edge] http :${port} failed:`, err.message);
    process.exitCode = 1;
  });
  return server;
}

function listenHttps(port, cert, key) {
  const server = https.createServer({ cert, key }, (req, res) =>
    onRequest(req, res, { listenPort: port, proto: "https" })
  );
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`[iptv-edge] https://0.0.0.0:${port} → ${BACKEND} (live splice on)`);
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
