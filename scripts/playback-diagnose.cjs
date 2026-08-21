#!/usr/bin/env node
/** Run on VPS: node scripts/playback-diagnose.mjs */
const { PrismaClient } = require("@prisma/client");
const { spawnSync } = require("child_process");
const fs = require("fs");

const prisma = new PrismaClient();

function curl(url, opts = {}) {
  const args = ["-sS", "--max-time", String(opts.timeout ?? 12), "-w", "\n__META__%{http_code}|%{size_download}|%{content_type}"];
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) args.push("-H", `${k}: ${v}`);
  }
  if (opts.ua) args.push("-A", opts.ua);
  args.push(url);
  const r = spawnSync("curl", args, { encoding: "utf8" });
  const raw = r.stdout || "";
  const idx = raw.lastIndexOf("__META__");
  const body = idx >= 0 ? raw.slice(0, idx) : raw;
  const meta = idx >= 0 ? raw.slice(idx + 8).trim().split("|") : ["?", "0", ""];
  return { http: meta[0], bytes: meta[1], ct: meta[2], body: body.slice(0, 200), err: r.stderr?.trim() };
}

async function main() {
  const line = await prisma.line.findUnique({ where: { username: "_smoke_test" } });
  if (!line) throw new Error("no _smoke_test line");
  const stream =
    (await prisma.stream.findFirst({
      where: { type: "LIVE", isActive: true, name: { contains: "BBC", mode: "insensitive" } },
      select: { id: true, name: true },
    })) ||
    (await prisma.stream.findFirst({ where: { type: "LIVE", isActive: true }, select: { id: true, name: true } }));
  if (!stream) throw new Error("no live stream");

  const env = fs.readFileSync(".env", "utf8");
  const secret = env.match(/^PANEL_INTERNAL_SECRET=(.+)$/m)?.[1]?.replace(/^["']|["']$/g, "") ?? "";

  const bases = ["http://127.0.0.1:80", "http://127.0.0.1:13000"];
  const exts = ["ts", "m3u8"];
  const uas = ["VLC/3.0.20 LibVLC/3.0.20", "ExoPlayer/2.11.3 (Linux; Android 11)"];

  console.log(JSON.stringify({ stream: stream.name, line: line.username, maxConnections: line.maxConnections }, null, 2));

  for (const base of bases) {
    for (const ext of exts) {
      for (const ua of uas) {
        const url = `${base}/live/${line.username}/${line.password}/${stream.id}.${ext}`;
        const r = curl(url, {
          ua,
          headers: { "X-Forwarded-For": "203.0.113.50" },
          timeout: ext === "ts" ? 6 : 10,
        });
        console.log(`${base.split(":").pop()} ${ext} ${ua.split("/")[0]} → HTTP ${r.http} bytes=${r.bytes} ct=${r.ct}`);
        if (r.http === "403") console.log("  body:", r.body.trim());
        if (r.err) console.log("  err:", r.err);
      }
    }
  }

  const authUrl = "http://127.0.0.1:13000/api/internal/live-auth";
  for (const ext of ["ts", "m3u8"]) {
    const r = curl(authUrl, {
      headers: {
        "x-panel-internal-secret": secret,
        "x-original-uri": `/live/${line.username}/${line.password}/${stream.id}.${ext}`,
        "x-forwarded-for": "203.0.113.50",
        "user-agent": "VLC/3.0.20",
      },
      timeout: 10,
    });
    console.log(`live-auth ${ext} → HTTP ${r.http} body=${r.body.trim()}`);
  }

  const active = await prisma.liveConnection.count({
    where: { lineId: line.id, lastSeenAt: { gte: new Date(Date.now() - 90_000) } },
  });
  console.log("active connections (90s):", active);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
