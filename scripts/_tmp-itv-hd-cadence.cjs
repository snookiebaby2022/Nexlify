#!/usr/bin/env node
"use strict";
const { PrismaClient } = require("@prisma/client");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const prisma = new PrismaClient();

function sample(url, maxMs) {
  return new Promise((resolve) => {
    const out = { hops: 0, host: "", code: 0, ttfbMs: null, bytes: 0, elapsedMs: 0, mbps: 0, idleGaps: 0, longestIdleMs: 0, gapOver2s: 0, err: "" };
    const t0 = Date.now();
    let last = t0;
    let done = false;
    const finish = (e) => {
      if (done) return;
      done = true;
      out.elapsedMs = Date.now() - t0;
      if (e) out.err = e;
      if (out.elapsedMs) out.mbps = (out.bytes * 8) / out.elapsedMs / 1000;
      resolve(out);
    };
    const go = (u, hop) => {
      out.hops = hop;
      let p;
      try { p = new URL(u); } catch { return finish("bad-url"); }
      out.host = p.host;
      const mod = p.protocol === "https:" ? https : http;
      const req = mod.request(u, { method: "GET", timeout: maxMs, headers: { "User-Agent": "VLC/3.0.20", Connection: "close" } }, (res) => {
        out.code = res.statusCode || 0;
        if ([301,302,303,307,308].includes(out.code) && res.headers.location && hop < 5) {
          res.resume();
          return go(new URL(res.headers.location, u).toString(), hop + 1);
        }
        res.on("data", (c) => {
          if (out.ttfbMs == null) out.ttfbMs = Date.now() - t0;
          const now = Date.now();
          const gap = now - last;
          if (out.bytes > 0 && gap > 1500) {
            out.idleGaps += 1;
            out.longestIdleMs = Math.max(out.longestIdleMs, gap);
            if (gap >= 2000) out.gapOver2s += 1;
          }
          last = now;
          out.bytes += c.length;
        });
        res.on("end", () => finish());
        res.on("close", () => { if (!done) finish(); });
      });
      req.on("timeout", () => { req.destroy(); finish("timeout"); });
      req.on("error", (e) => finish(String(e.message||e).slice(0,80)));
      setTimeout(() => { if (!done) { req.destroy(); finish("cut"); } }, maxMs);
      req.end();
    };
    go(url, 0);
  });
}

(async () => {
  const s = await prisma.stream.findUnique({ where: { id: "cmstm4pud4nu4vhyabh849p0d" }, select: { streamUrl: true, xtreamNum: true } });
  const smoke = await prisma.line.findFirst({ where: { username: "_smoke_test" }, select: { username: true, password: true } });
  console.log("=== origin 20s realtime ===");
  console.log(JSON.stringify(await sample(s.streamUrl, 20000)));
  const edge = `http://209.237.141.15:8080/live/${smoke.username}/${smoke.password}/${s.xtreamNum}.ts`;
  console.log("=== 10gbs 20s realtime ===");
  console.log(JSON.stringify(await sample(edge, 20000)));
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
