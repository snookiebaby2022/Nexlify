#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import http from "node:http";
import https from "node:https";

const p = new PrismaClient();

function numId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function sample(url, sec = 30, follow = 5) {
  return new Promise((resolve) => {
    const visit = (u, depth) => {
      if (depth > follow) return resolve({ error: "too_many_redirects" });
      const lib = u.startsWith("https") ? https : http;
      const t0 = Date.now();
      let total = 0;
      let maxGap = 0;
      let last = 0;
      let g25 = 0;
      let status = 0;
      let fb = null;
      const req = lib.get(u, { headers: { "User-Agent": "VLC/3.0.20" } }, (res) => {
        status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return visit(new URL(res.headers.location, u).href, depth + 1);
        }
        if (status >= 400) {
          res.resume();
          res.on("end", () => resolve({ status, error: `http_${status}`, totalBytes: total }));
          return;
        }
        res.on("data", (b) => {
          const now = Date.now();
          if (fb == null) fb = now - t0;
          if (last) {
            const g = now - last;
            if (g > maxGap) maxGap = g;
            if (g >= 2500) g25++;
          }
          last = now;
          total += b.length;
        });
        res.on("end", () => {
          const el = (Date.now() - t0) / 1000;
          resolve({
            status,
            totalBytes: total,
            mbps: el ? Number(((total * 8) / el / 1e6).toFixed(2)) : 0,
            firstByteMs: fb,
            maxGap,
            gapsOver2_5s: g25,
            elapsedSec: Math.round(el),
            ok: total > 50_000,
          });
        });
        setTimeout(() => req.destroy(), sec * 1000);
      });
      req.on("error", (e) => resolve({ error: e.message }));
    };
    visit(url, 0);
  });
}

(async () => {
const ids = [
  "cmtgxc8jt00z2vhxgx7xmhosf",
  "cmstm4pop4ntsvhyab0v15t1g",
  "cmthofi8w01xnvh27nmxr628m",
  "cmtcp5to201cevh0wmmpcuxfd",
];

const line = await p.line.findFirst({
  where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
  select: { username: true, password: true },
});

const hevc = await p.stream.findMany({
  where: {
    type: "LIVE",
    isActive: true,
    name: { contains: "Premier League HEVC", mode: "insensitive" },
  },
  select: { id: true, name: true, vodMode: true, isOnDemand: true, streamUrl: true, backupUrl: true },
});

const byId = await Promise.all(
  ids.map((id) =>
    p.stream.findUnique({
      where: { id },
      select: { id: true, name: true, vodMode: true, isOnDemand: true, streamUrl: true, backupUrl: true },
    })
  )
);

const seen = new Set();
const rows = [];
for (const s of [...byId.filter(Boolean), ...hevc]) {
  if (!s || seen.has(s.id)) continue;
  seen.add(s.id);
  rows.push(s);
}


const out = [];
for (const s of rows) {
  const panel = `http://127.0.0.1:8080/live/${line.username}/${line.password}/${numId(s.id)}.ts`;
  const [up, pan] = await Promise.all([sample(s.streamUrl, 25, true), sample(panel, 30, false)]);
  let backupProbe = null;
  if (s.backupUrl?.trim()) backupProbe = await sample(s.backupUrl.trim(), 25, true);
  out.push({
    name: s.name,
    id: s.id,
    mode: s.vodMode,
    onDemand: s.isOnDemand,
    url: s.streamUrl?.slice(0, 90),
    backup: s.backupUrl?.slice(0, 90) || null,
    upstream: up,
    panel: pan,
    backupProbe,
  });
}

console.log(JSON.stringify(out, null, 2));
const fs = await import("node:fs");
fs.writeFileSync("/tmp/probe-follow-out.json", JSON.stringify(out, null, 2));
await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
