#!/usr/bin/env node
/**
 * Smoke test BBC One (or named stream): direct URL vs panel /live replay.
 * Run on panel VPS: node scripts/bbc-one-playback-smoke.cjs [stream name substring]
 */
const { PrismaClient } = require("@prisma/client");
const { spawnSync } = require("child_process");

const NAME_FILTER = process.argv[2] || "BBC ONE";
const PORT = process.env.PORT || process.env.PANEL_PORT || "13000";
const BASE = process.env.SMOKE_BASE || `http://127.0.0.1:${PORT}`;

function curl(opts) {
  const args = [
    "-sS",
    "--max-time",
    String(opts.timeout ?? 20),
    "-o",
    opts.out ?? "/dev/null",
    "-w",
    opts.fmt ?? "%{http_code}|%{content_type}|%{redirect_url}|%{size_download}",
  ];
  if (opts.head) args.push("-I");
  if (opts.ua) args.push("-A", opts.ua);
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      args.push("-H", `${k}: ${v}`);
    }
  }
  args.push(opts.url);
  const r = spawnSync("curl", args, { encoding: "utf8" });
  const out = (r.stdout || "").trim();
  const err = (r.stderr || "").trim();
  if (r.status !== 0 && !out) {
    return { ok: false, error: err || `curl exit ${r.status}` };
  }
  const parts = out.split("|");
  return {
    ok: true,
    http: parts[0] || "?",
    contentType: parts[1] || "",
    redirect: parts[2] || "",
    bytes: parts[3] || "0",
    raw: out,
    stderr: err,
  };
}

function probeDirect(url) {
  console.log(`\n--- Direct URL probe ---`);
  console.log(`URL: ${url}`);
  const head = curl({ url, head: true, timeout: 15 });
  if (!head.ok) {
    console.log(`HEAD fail: ${head.error}`);
    return head;
  }
  console.log(`HEAD → HTTP ${head.http} type=${head.contentType || "—"} redirect=${head.redirect || "—"}`);

  const get = curl({
    url,
    timeout: 12,
    fmt: "%{http_code}|%{content_type}|%{size_download}",
    out: "/dev/null",
    ua: "Mozilla/5.0 (compatible; NexlifySmoke/1.0)",
  });
  if (get.ok) {
    console.log(`GET  → HTTP ${get.http} type=${get.contentType || "—"} bytes=${get.bytes}`);
  } else {
    console.log(`GET fail: ${get.error}`);
  }
  return { head, get };
}

function testLiveReplay(base, user, pass, streamId, label) {
  const ua = "IPTV Smarters/1.0 (Linux; Android 11) NexlifySmoke";
  const path = `/live/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${streamId}.ts`;
  const url = `${base}${path}`;

  console.log(`\n--- Panel live ${label} ---`);
  console.log(`GET ${path}`);

  const first = curl({
    url,
    ua,
    timeout: 25,
    fmt: "%{http_code}|%{content_type}|%{redirect_url}|%{size_download}",
    headers: { "X-Forwarded-For": "203.0.113.50" },
  });
  if (!first.ok) {
    console.log(`Request 1 fail: ${first.error}`);
    return { first, second: null };
  }
  console.log(
    `Play #1 → HTTP ${first.http} type=${first.contentType || "—"} redirect=${first.redirect || "—"} bytes=${first.bytes}`
  );
  if (first.http === "403") console.log("  ^ likely max connections or IP block");
  if (first.http === "502") console.log("  ^ upstream/remux failure");

  const second = curl({
    url,
    ua,
    timeout: 25,
    fmt: "%{http_code}|%{content_type}|%{redirect_url}|%{size_download}",
    headers: { "X-Forwarded-For": "203.0.113.50" },
  });
  if (!second.ok) {
    console.log(`Request 2 fail: ${second.error}`);
    return { first, second };
  }
  console.log(
    `Play #2 → HTTP ${second.http} type=${second.contentType || "—"} redirect=${second.redirect || "—"} bytes=${second.bytes}`
  );
  if (second.http === "403" && first.http === "200") {
    console.log("  *** REPLAY BUG: first OK, second blocked (max connections?) ***");
  }
  if (second.http !== first.http) {
    console.log(`  *** STATUS CHANGED: ${first.http} → ${second.http} ***`);
  }
  return { first, second };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const stream = await prisma.stream.findFirst({
      where: { name: { contains: NAME_FILTER, mode: "insensitive" }, type: "LIVE" },
      select: {
        id: true,
        name: true,
        streamUrl: true,
        backupUrl: true,
        lastProbeOk: true,
        lastProbeError: true,
        hostedExternally: true,
        maxConnectionsPerStream: true,
      },
    });
    if (!stream) {
      console.error(`No LIVE stream matching "${NAME_FILTER}"`);
      process.exit(1);
    }

    console.log("=== BBC / stream playback smoke ===");
    console.log(`Stream: ${stream.name} (${stream.id})`);
    console.log(`streamUrl: ${stream.streamUrl}`);
    console.log(`lastProbeOk: ${stream.lastProbeOk} ${stream.lastProbeError || ""}`);
    console.log(`Panel base: ${BASE}`);

    probeDirect(stream.streamUrl);

    let line = await prisma.line.findFirst({
      where: {
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
        bouquets: {
          some: {
            bouquet: {
              isActive: true,
              streams: { some: { streamId: stream.id } },
            },
          },
        },
      },
      select: { username: true, password: true, maxConnections: true },
    });

    if (!line) {
      line = await prisma.line.findFirst({
        where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
        select: { username: true, password: true, maxConnections: true },
        orderBy: { createdAt: "desc" },
      });
      if (line) console.log("\nWARN: using line without bouquet match on this stream");
    }

    if (!line) {
      console.log("\nSKIP panel live test — no active line");
      process.exit(0);
    }

    console.log(`\nLine: ${line.username} maxConnections=${line.maxConnections}`);

    const activeBefore = await prisma.liveConnection.count({
      where: {
        lineId: (
          await prisma.line.findUnique({ where: { username: line.username }, select: { id: true } })
        ).id,
        lastSeenAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
    });
    console.log(`Active connections (line, last 5m): ${activeBefore}`);

    testLiveReplay(BASE, line.username, line.password, stream.id, "before fix deploy");

    console.log("\n=== Summary ===");
    console.log("- Direct URL: if HEAD/GET fail, source provider is down or blocking VPS IP");
    console.log("- Play #1 vs #2: 403 on replay = max-connections bug; 502 = HLS remux/upstream");
    console.log("- 302 redirect = panel passes through direct MPEG-TS/HLS URL to client");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
