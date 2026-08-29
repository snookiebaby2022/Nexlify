#!/usr/bin/env node
/** Diagnose 0-byte live playback on server 45. */
const { PrismaClient } = require("@prisma/client");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

require(path.join(__dirname, "load-env.cjs")).loadEnv();

const p = new PrismaClient();

function fetchBytes(url, headers = {}, maxMs = 15000) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(
      url,
      { method: "GET", timeout: maxMs, headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", ...headers } },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (chunks.length < 4) chunks.push(c);
          if (size >= 65536) req.destroy();
        });
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, size, magic: buf.slice(0, 4).toString("hex"), ct: res.headers["content-type"] });
        });
      }
    );
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, error: "timeout" });
    });
    req.end();
  });
}

function liveAuth(uri, secret) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 13000,
        path: "/api/internal/live-auth",
        method: "GET",
        headers: {
          "x-panel-internal-secret": secret,
          "x-original-uri": uri,
          "x-original-method": "GET",
          "x-forwarded-for": "127.0.0.1",
          "user-agent": "VLC/3.0.20 LibVLC/3.0.20",
        },
        timeout: 10000,
      },
      (res) => {
        res.resume();
        resolve({
          status: res.statusCode,
          upstream: res.headers["x-nexlify-upstream"] || "",
          alts: res.headers["x-nexlify-alts"] || "",
          live: res.headers["x-nexlify-live"] || "",
          streamId: res.headers["x-nexlify-stream-id"] || "",
        });
      }
    );
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, error: "timeout" });
    });
    req.end();
  });
}

(async () => {
  const secret = process.env.PANEL_INTERNAL_SECRET || "";
  const credsLine = require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  }).trim();
  const { u: U, p: P } = JSON.parse(credsLine);
  const sid = 1476023810;

  const streams = await p.stream.findMany({
    where: { xtreamNum: sid, isActive: true },
    select: { id: true, name: true, streamUrl: true, backupUrl: true, lastProbeOk: true },
    take: 5,
  });

  const stream = streams[0];
  const url = stream?.streamUrl?.trim() || "";
  const uri = `/live/${U}/${P}/${sid}.ts`;

  const [direct, ranged, auth, panel] = await Promise.all([
    url ? fetchBytes(url) : Promise.resolve(null),
    url ? fetchBytes(url, { Range: "bytes=0-" }) : Promise.resolve(null),
    liveAuth(uri, secret),
    fetchBytes(`http://127.0.0.1:8080${uri}`, { Range: "bytes=0-" }),
  ]);

  let authUpstream = null;
  if (auth.upstream) {
    authUpstream = await fetchBytes(auth.upstream);
  }

  console.log(
    JSON.stringify(
      {
        smoke: { user: U, sid, uri },
        stream,
        allMatches: streams.length,
        direct,
        ranged,
        auth,
        authUpstream,
        panel8080: panel,
      },
      null,
      2
    )
  );

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
