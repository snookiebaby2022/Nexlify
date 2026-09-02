#!/usr/bin/env node
"use strict";
/**
 * Diagnose ITV HD (UK Entertainment) buffering + missing QoE.
 * Prints metrics only — never credentials or full stream URLs.
 */
const { PrismaClient } = require("@prisma/client");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const prisma = new PrismaClient();

function redactUrl(u) {
  if (!u) return "";
  try {
    const x = new URL(u);
    if (x.username || x.password) x.username = "x";
    x.password = x.password ? "x" : "";
    const path = x.pathname.replace(/\/[^/]{4,}\/[^/]{4,}\//, "/u/p/");
    return `${x.protocol}//${x.host}${path}${x.search ? "?…" : ""}`;
  } catch {
    return String(u).replace(/https?:\/\/[^/\s]+/g, "http://host").slice(0, 80);
  }
}

function hostOf(u) {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
}

function sampleStream(url, opts = {}) {
  const maxMs = opts.maxMs || 12000;
  const maxBytes = opts.maxBytes || 8_000_000;
  const ua = opts.ua || "VLC/3.0.20 LibVLC/3.0.20";
  return new Promise((resolve) => {
    const out = {
      ok: false,
      code: 0,
      ttfbMs: null,
      bytes: 0,
      elapsedMs: 0,
      mbps: 0,
      tsSync: false,
      html: false,
      m3u8: false,
      ct: "",
      loc: "",
      idleGaps: 0,
      longestIdleMs: 0,
      err: "",
    };
    if (!url || !/^https?:\/\//i.test(url)) {
      out.err = "bad-url";
      return resolve(out);
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      out.err = "bad-url";
      return resolve(out);
    }
    const t0 = Date.now();
    let lastData = t0;
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      out.elapsedMs = Date.now() - t0;
      out.err = err || out.err;
      if (out.elapsedMs > 0) out.mbps = (out.bytes * 8) / out.elapsedMs / 1000;
      resolve(out);
    };
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        timeout: maxMs,
        headers: { "User-Agent": ua, Connection: "close" },
      },
      (res) => {
        out.code = res.statusCode || 0;
        out.ct = String(res.headers["content-type"] || "").slice(0, 80);
        out.loc = String(res.headers.location || "").slice(0, 80);
        out.ok = out.code >= 200 && out.code < 400;
        const chunksHead = [];
        res.on("data", (c) => {
          if (out.ttfbMs == null) out.ttfbMs = Date.now() - t0;
          const now = Date.now();
          const gap = now - lastData;
          if (out.bytes > 0 && gap > 1500) {
            out.idleGaps += 1;
            if (gap > out.longestIdleMs) out.longestIdleMs = gap;
          }
          lastData = now;
          out.bytes += c.length;
          if (chunksHead.length < 8) chunksHead.push(c);
          const head = Buffer.concat(chunksHead).subarray(0, 512);
          const text = head.toString("utf8");
          if (text.includes("#EXTM3U")) out.m3u8 = true;
          if (/<!DOCTYPE|<html/i.test(text)) out.html = true;
          if (head.includes(0x47)) out.tsSync = true;
          if (out.bytes >= maxBytes) {
            req.destroy();
            finish();
          }
        });
        res.on("end", () => finish());
        res.on("close", () => {
          if (!done) finish();
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      finish("timeout");
    });
    req.on("error", (e) => finish(String(e.message || e).slice(0, 80)));
    setTimeout(() => {
      if (!done) {
        req.destroy();
        finish("cut");
      }
    }, maxMs);
    req.end();
  });
}

function summarize(rows) {
  return rows.map((s) => ({
    id: s.id,
    xtreamNum: s.xtreamNum,
    name: s.name,
    cat: s.category?.name || null,
    active: s.isActive,
    onDemand: s.isOnDemand,
    vodMode: s.vodMode,
    probeOk: s.lastProbeOk,
    probeAt: s.lastProbeAt,
    probeErr: s.lastProbeError ? String(s.lastProbeError).slice(0, 120) : null,
    host: hostOf(s.streamUrl),
    backupHost: hostOf(s.backupUrl || ""),
    hasBackup: Boolean(s.backupUrl),
    provider: s.provider?.name || null,
    server: s.server?.name || null,
    hostedExt: s.hostedExternally,
    autoRestart: s.autoRestart,
    url: redactUrl(s.streamUrl),
  }));
}

(async () => {
  const cats = await prisma.category.findMany({
    where: {
      categoryType: "LIVE",
      OR: [
        { name: { contains: "UK Entertainment", mode: "insensitive" } },
        { name: { contains: "Entertainment", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, categoryType: true },
    take: 30,
  });
  console.log("=== categories ===");
  console.log(JSON.stringify(cats));

  const ukEnt = cats.find((c) => /uk\s*entertainment/i.test(c.name)) || cats[0];

  const itv = await prisma.stream.findMany({
    where: {
      type: "LIVE",
      AND: [
        {
          OR: [
            { name: { equals: "ITV HD", mode: "insensitive" } },
            { name: { contains: "ITV HD", mode: "insensitive" } },
            { name: { contains: "ITV 1 HD", mode: "insensitive" } },
            { name: { equals: "ITV", mode: "insensitive" } },
          ],
        },
        ukEnt
          ? {
              OR: [
                { categoryId: ukEnt.id },
                { category: { name: { contains: "UK Entertainment", mode: "insensitive" } } },
              ],
            }
          : {},
      ],
    },
    include: {
      category: { select: { name: true } },
      provider: { select: { name: true } },
      server: { select: { name: true, host: true } },
    },
    take: 40,
  });

  const itvAny = itv.length
    ? itv
    : await prisma.stream.findMany({
        where: {
          type: "LIVE",
          name: { contains: "ITV HD", mode: "insensitive" },
        },
        include: {
          category: { select: { name: true } },
          provider: { select: { name: true } },
          server: { select: { name: true, host: true } },
        },
        take: 40,
      });

  console.log("=== itv matches ===");
  console.log(JSON.stringify(summarize(itvAny), null, 2));

  const target = itvAny.find((s) => /uk\s*entertainment/i.test(s.category?.name || "")) || itvAny[0];
  if (!target) {
    console.log("NO_ITV_HD");
    await prisma.$disconnect();
    process.exit(1);
  }

  const issues = await prisma.streamIssue.findMany({
    where: { streamId: target.id },
    orderBy: { detectedAt: "desc" },
    take: 8,
    select: { issueType: true, severity: true, detectedAt: true, resolvedAt: true, fixAction: true, fixResult: true },
  }).catch(() => []);
  console.log("=== issues ===");
  console.log(JSON.stringify(issues));

  const conns = await prisma.liveConnection.findMany({
    where: { streamId: target.id },
    orderBy: { lastSeenAt: "desc" },
    take: 20,
    select: {
      id: true,
      ip: true,
      userAgent: true,
      startedAt: true,
      lastSeenAt: true,
      line: { select: { username: true } },
    },
  });
  const now = Date.now();
  console.log("=== live connections (this stream) ===");
  console.log(
    JSON.stringify(
      conns.map((c) => ({
        user: c.line?.username,
        ip: c.ip,
        ua: String(c.userAgent || "").slice(0, 80),
        ageSec: Math.round((now - c.lastSeenAt.getTime()) / 1000),
        durSec: Math.round((c.lastSeenAt.getTime() - c.startedAt.getTime()) / 1000),
      }))
    )
  );

  const recentWatch = await prisma.lineChannelWatch.findMany({
    where: { streamId: target.id },
    orderBy: { lastWatchedAt: "desc" },
    take: 8,
    select: { lastWatchedAt: true, line: { select: { username: true } } },
  }).catch(() => []);
  console.log("=== recent watches ===");
  console.log(
    JSON.stringify(
      recentWatch.map((w) => ({
        user: w.line?.username,
        agoSec: Math.round((now - w.lastWatchedAt.getTime()) / 1000),
      }))
    )
  );

  const sameHost = hostOf(target.streamUrl);
  const ukEntStreams = await prisma.stream.findMany({
    where: {
      type: "LIVE",
      isActive: true,
      category: { name: { contains: "UK Entertainment", mode: "insensitive" } },
    },
    select: { id: true, name: true, streamUrl: true, lastProbeOk: true, lastProbeError: true },
    take: 400,
  });
  const hostCounts = {};
  for (const s of ukEntStreams) {
    const h = hostOf(s.streamUrl) || "(none)";
    hostCounts[h] = (hostCounts[h] || 0) + 1;
  }
  console.log("=== uk entertainment origin hosts ===");
  console.log(JSON.stringify(hostCounts));
  console.log("=== uk entertainment probe fail ===");
  const fails = ukEntStreams.filter((s) => s.lastProbeOk === false);
  console.log(JSON.stringify({ failCount: fails.length, sample: fails.slice(0, 15).map((s) => s.name) }));

  const control = ukEntStreams.find((s) => /bbc one/i.test(s.name) && /hd|fhd/i.test(s.name))
    || ukEntStreams.find((s) => /bbc one/i.test(s.name));

  console.log("=== origin probe ITV ===");
  const origin = await sampleStream(target.streamUrl, { maxMs: 12000 });
  console.log(JSON.stringify(origin));
  if (target.backupUrl) {
    console.log("=== origin probe ITV backup ===");
    console.log(JSON.stringify(await sampleStream(target.backupUrl, { maxMs: 8000 })));
  }
  if (control) {
    console.log("=== origin probe control ===");
    console.log(JSON.stringify({ name: control.name, host: hostOf(control.streamUrl), ...(await sampleStream(control.streamUrl, { maxMs: 8000 })) }));
  }

  const smoke = await prisma.line.findFirst({
    where: { username: "_smoke_test", status: "ACTIVE" },
    select: { username: true, password: true },
  });
  const playId = target.xtreamNum || target.id;
  if (smoke) {
    const edgeUrl = `http://209.237.141.15:8080/live/${smoke.username}/${smoke.password}/${playId}.ts`;
    const panelUrl = `http://127.0.0.1:8080/live/${smoke.username}/${smoke.password}/${playId}.ts`;
    console.log("=== 10gbs splice probe ===");
    console.log(JSON.stringify(await sampleStream(edgeUrl, { maxMs: 12000 })));
    console.log("=== 45 nginx :8080 probe ===");
    console.log(JSON.stringify(await sampleStream(panelUrl, { maxMs: 12000 })));
    if (control?.xtreamNum || control?.id) {
      const cid = control.xtreamNum || control.id;
      const cUrl = `http://209.237.141.15:8080/live/${smoke.username}/${smoke.password}/${cid}.ts`;
      console.log("=== 10gbs control splice ===");
      console.log(JSON.stringify({ name: control.name, ...(await sampleStream(cUrl, { maxMs: 8000 })) }));
    }
  } else {
    console.log("NO_SMOKE_LINE");
  }

  // Same-host UK Entertainment: probe 8 others for same stall pattern
  const siblings = ukEntStreams.filter((s) => hostOf(s.streamUrl) === sameHost && s.id !== target.id).slice(0, 8);
  console.log("=== same-origin sibling probes ===");
  for (const s of siblings) {
    const p = await sampleStream(s.streamUrl, { maxMs: 7000, maxBytes: 3_000_000 });
    console.log(JSON.stringify({ name: s.name, ...p }));
  }

  await prisma.$disconnect();
  console.log("DIAG_OK");
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
