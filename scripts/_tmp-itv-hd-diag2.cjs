#!/usr/bin/env node
"use strict";
const { PrismaClient } = require("@prisma/client");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const Redis = require("ioredis");

const prisma = new PrismaClient();
const SID = "cmstm4pud4nu4vhyabh849p0d";
const SID2 = "cmth8j9sd0s2gvhre7tw7s1sp";

function hostOf(u) {
  try { return new URL(u).host; } catch { return ""; }
}

function sample(url, opts = {}) {
  const maxMs = opts.maxMs || 15000;
  const maxBytes = opts.maxBytes || 8_000_000;
  const maxHops = opts.maxHops ?? 5;
  return new Promise((resolve) => {
    const out = {
      hops: 0,
      finalHost: "",
      code: 0,
      ttfbMs: null,
      bytes: 0,
      elapsedMs: 0,
      mbps: 0,
      tsSync: false,
      html: false,
      m3u8: false,
      ct: "",
      idleGaps: 0,
      longestIdleMs: 0,
      err: "",
    };
    const t0 = Date.now();
    let lastData = t0;
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      out.elapsedMs = Date.now() - t0;
      if (err) out.err = err;
      if (out.elapsedMs > 0) out.mbps = (out.bytes * 8) / out.elapsedMs / 1000;
      resolve(out);
    };
    const go = (u, hop) => {
      out.hops = hop;
      let parsed;
      try { parsed = new URL(u); } catch { return finish("bad-url"); }
      out.finalHost = parsed.host;
      const mod = parsed.protocol === "https:" ? https : http;
      const req = mod.request(u, {
        method: "GET",
        timeout: maxMs,
        headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Connection: "close" },
      }, (res) => {
        out.code = res.statusCode || 0;
        out.ct = String(res.headers["content-type"] || "").slice(0, 80);
        if ([301, 302, 303, 307, 308].includes(out.code) && res.headers.location && hop < maxHops) {
          res.resume();
          const next = new URL(res.headers.location, u).toString();
          return go(next, hop + 1);
        }
        res.on("data", (c) => {
          if (out.ttfbMs == null) out.ttfbMs = Date.now() - t0;
          const now = Date.now();
          if (out.bytes > 0 && now - lastData > 1500) {
            out.idleGaps += 1;
            out.longestIdleMs = Math.max(out.longestIdleMs, now - lastData);
          }
          lastData = now;
          out.bytes += c.length;
          if (c.includes(0x47)) out.tsSync = true;
          const t = c.toString("utf8").slice(0, 200);
          if (t.includes("#EXTM3U")) out.m3u8 = true;
          if (/<!DOCTYPE|<html/i.test(t)) out.html = true;
          if (out.bytes >= maxBytes) {
            req.destroy();
            finish("cut");
          }
        });
        res.on("end", () => finish());
        res.on("close", () => { if (!done) finish(); });
      });
      req.on("timeout", () => { req.destroy(); finish("timeout"); });
      req.on("error", (e) => finish(String(e.message || e).slice(0, 80)));
      setTimeout(() => { if (!done) { req.destroy(); finish("cut"); } }, maxMs);
      req.end();
    };
    go(url, 0);
  });
}

(async () => {
  const streams = await prisma.stream.findMany({
    where: { id: { in: [SID, SID2] } },
    select: { id: true, name: true, streamUrl: true, backupUrl: true, isOnDemand: true, vodMode: true, xtreamNum: true },
  });
  console.log("=== origins follow-redirect ===");
  for (const s of streams) {
    console.log(JSON.stringify({ id: s.id, name: s.name, onDemand: s.isOnDemand, vodMode: s.vodMode, host: hostOf(s.streamUrl), probe: await sample(s.streamUrl, { maxMs: 15000 }) }));
    if (s.backupUrl) {
      console.log(JSON.stringify({ id: s.id, which: "backup", host: hostOf(s.backupUrl), probe: await sample(s.backupUrl, { maxMs: 10000 }) }));
    }
  }

  const line = await prisma.line.findFirst({ where: { username: "Leeht2025a" }, select: { id: true, username: true } });
  console.log("=== watcher ===", JSON.stringify(line));

  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const r = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
  await r.connect().catch(() => null);
  const patterns = [
    `nexlify:conn:q:${line?.id || "x"}:${SID}:*`,
    `nexlify:conn:q:*:${SID}:*`,
    `nexlify:conn:q:*:${SID2}:*`,
  ];
  console.log("=== redis qoe keys ===");
  for (const pat of patterns) {
    const keys = [];
    let cursor = "0";
    do {
      const [next, batch] = await r.scan(cursor, "MATCH", pat, "COUNT", 200);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== "0" && keys.length < 30);
    const vals = [];
    for (const k of keys.slice(0, 10)) {
      const raw = await r.get(k);
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = { rawLen: raw?.length }; }
      const ip = k.split(":").slice(5).join(":");
      vals.push({ ip, totalBytes: parsed?.totalBytes, stallCount: parsed?.stallCount, lastByteAt: parsed?.lastByteAt, ageMs: parsed?.lastByteAt ? Date.now() - parsed.lastByteAt : null });
    }
    console.log(JSON.stringify({ pat, count: keys.length, sample: vals }));
  }
  await r.quit().catch(() => {});

  const uk = await prisma.category.findFirst({ where: { name: "UK | Entertainment" }, select: { id: true } });
  const rows = await prisma.stream.findMany({
    where: { type: "LIVE", categoryId: uk.id },
    select: { id: true, name: true, isActive: true, isOnDemand: true, vodMode: true, streamUrl: true, lastProbeOk: true },
  });
  const nameCounts = {};
  const onDemand = [];
  const hosts = {};
  for (const s of rows) {
    nameCounts[s.name] = (nameCounts[s.name] || 0) + 1;
    const h = hostOf(s.streamUrl) || "(none)";
    hosts[h] = (hosts[h] || 0) + 1;
    if (s.isOnDemand || s.vodMode === "ON_DEMAND") onDemand.push(s.name);
  }
  const dupes = Object.entries(nameCounts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  console.log("=== uk entertainment catalog ===");
  console.log(JSON.stringify({
    total: rows.length,
    active: rows.filter((s) => s.isActive).length,
    onDemandCount: onDemand.length,
    onDemandSample: onDemand.slice(0, 25),
    duplicateNames: dupes.length,
    duplicateSample: dupes.slice(0, 20),
    hosts,
  }));

  // Other ITV HD-like rows anywhere
  const itvAll = await prisma.stream.findMany({
    where: { type: "LIVE", name: { contains: "ITV 1 HD", mode: "insensitive" } },
    select: { id: true, name: true, isActive: true, isOnDemand: true, vodMode: true, category: { select: { name: true } }, streamUrl: true },
    take: 20,
  });
  console.log("=== all ITV 1 HD ===");
  console.log(JSON.stringify(itvAll.map((s) => ({ id: s.id, name: s.name, cat: s.category?.name, active: s.isActive, onDemand: s.isOnDemand, vodMode: s.vodMode, host: hostOf(s.streamUrl) }))));

  await prisma.$disconnect();
  console.log("DIAG2_OK");
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
