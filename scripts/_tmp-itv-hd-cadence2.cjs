#!/usr/bin/env node
"use strict";
const { PrismaClient } = require("@prisma/client");
const http = require("http");
const prisma = new PrismaClient();
(async () => {
  const s = await prisma.stream.findUnique({
    where: { id: "cmstm4pud4nu4vhyabh849p0d" },
    select: { xtreamNum: true, isActive: true, name: true },
  });
  const smoke = await prisma.line.findFirst({
    where: { username: "_smoke_test" },
    select: { username: true, password: true },
  });
  const url = `http://209.237.141.15:8080/live/${smoke.username}/${smoke.password}/${s.xtreamNum}.ts`;
  const maxMs = 20000;
  const out = { name: s.name, active: s.isActive, code: 0, ttfbMs: null, bytes: 0, elapsedMs: 0, mbps: 0, idleGaps: 0, longestIdleMs: 0 };
  await new Promise((resolve) => {
    const t0 = Date.now();
    let last = t0;
    const req = http.get(url, { timeout: maxMs, headers: { "User-Agent": "VLC/3.0.20" } }, (res) => {
      out.code = res.statusCode || 0;
      res.on("data", (c) => {
        if (out.ttfbMs == null) out.ttfbMs = Date.now() - t0;
        const now = Date.now();
        if (out.bytes > 0 && now - last > 1500) {
          out.idleGaps += 1;
          out.longestIdleMs = Math.max(out.longestIdleMs, now - last);
        }
        last = now;
        out.bytes += c.length;
      });
      res.on("end", () => {
        out.elapsedMs = Date.now() - t0;
        resolve();
      });
    });
    req.on("error", (e) => {
      out.err = String(e.message).slice(0, 80);
      out.elapsedMs = Date.now() - t0;
      resolve();
    });
    setTimeout(() => {
      req.destroy();
      out.elapsedMs = Date.now() - t0;
      out.err = out.err || "cut";
      resolve();
    }, maxMs);
  });
  if (out.elapsedMs) out.mbps = (out.bytes * 8) / out.elapsedMs / 1000;
  console.log(JSON.stringify(out));
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
