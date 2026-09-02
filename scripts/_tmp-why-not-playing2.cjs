#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const http = require("http");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

function get(url, headers = {}, ms = 15000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: ms, headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => {
        chunks.push(c);
        if (Buffer.concat(chunks).length > 65536) req.destroy();
      });
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          bytes: buf.length,
          ct: res.headers["content-type"] || "",
          body: buf.slice(0, 80).toString("utf8"),
          mpegts: buf[0] === 0x47,
        });
      });
    });
    req.on("error", (e) => resolve({ error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ error: "timeout" });
    });
  });
}

function liveAuth(uri, extra = {}) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 13000,
        path: "/api/internal/live-auth",
        method: "GET",
        timeout: 12000,
        headers: {
          "x-panel-internal-secret": process.env.PANEL_INTERNAL_SECRET || "",
          "x-original-uri": uri,
          "x-original-method": "GET",
          "x-forwarded-for": "127.0.0.1",
          "user-agent": "VLC/3.0.20 LibVLC/3.0.20",
          ...extra,
        },
      },
      (res) => {
        resolve({
          status: res.statusCode,
          upstream: (res.headers["x-nexlify-upstream"] || "").slice(0, 80),
          live: res.headers["x-nexlify-live"] || "",
          streamId: res.headers["x-nexlify-stream-id"] || "",
        });
        res.resume();
      }
    );
    req.on("error", (e) => resolve({ error: e.message }));
    req.end();
  });
}

(async () => {
  const creds = JSON.parse(
    require("child_process").execSync("node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1", { encoding: "utf8" }).trim()
  );
  const catalog = await get(
    `http://127.0.0.1:13000/player_api.php?username=${encodeURIComponent(creds.u)}&password=${encodeURIComponent(creds.p)}&action=get_live_streams`
  );
  let streams = [];
  try {
    streams = JSON.parse(catalog.body.startsWith("[") || catalog.body.startsWith("{") ? catalog.body : "[]");
  } catch {
    streams = [];
  }
  if (!Array.isArray(streams)) streams = [];
  // catalog fetch may have been truncated; fetch full via curl-less second request collecting more
  const full = await new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:13000/player_api.php?username=${encodeURIComponent(creds.u)}&password=${encodeURIComponent(creds.p)}&action=get_live_streams`,
      { timeout: 20000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (e) {
            resolve({ parseError: e.message, bytes: Buffer.concat(chunks).length });
          }
        });
      }
    );
    req.on("error", (e) => resolve({ error: e.message }));
  });
  const list = Array.isArray(full) ? full : [];
  const sample = list[0] || null;
  const sid = sample && (sample.stream_id || sample.id);
  const uri = sid ? `/live/${creds.u}/${creds.p}/${sid}.ts` : null;
  const server = await p.streamServer.findFirst({ where: { name: "10gbs" }, select: { id: true, agentToken: true } });
  const agentHeaders = {
    authorization: `Bearer ${server.agentToken}`,
    "x-nexlify-agent-server-id": server.id,
  };
  const recent = await p.liveConnection.findMany({
    take: 5,
    orderBy: { lastSeenAt: "desc" },
    select: {
      lastSeenAt: true,
      streamId: true,
      lineId: true,
      stream: { select: { name: true, xtreamNum: true, serverId: true } },
      line: { select: { username: true } },
    },
  });
  const out = {
    catalogCount: list.length,
    sample: sample
      ? { stream_id: sample.stream_id, name: sample.name, stream_type: sample.stream_type }
      : null,
    uri,
    authLocal: uri ? await liveAuth(uri) : null,
    authAgent: uri ? await liveAuth(uri, agentHeaders) : null,
    play10: uri ? await get(`http://209.237.141.15:8080${uri}`) : null,
    play45: uri ? await get(`http://127.0.0.1:8080${uri}`) : null,
    recent: recent.map((r) => ({
      at: r.lastSeenAt,
      user: r.line?.username,
      name: r.stream?.name,
      xtreamNum: r.stream?.xtreamNum,
      serverId: r.stream?.serverId,
      on10gbs: r.stream?.serverId === server.id,
    })),
  };
  if (recent[0]?.line?.username && recent[0]?.stream?.xtreamNum) {
    const line = await p.line.findUnique({
      where: { username: recent[0].line.username },
      select: { username: true, password: true },
    });
    if (line) {
      const ruri = `/live/${line.username}/${line.password}/${recent[0].stream.xtreamNum}.ts`;
      out.realUri = ruri.replace(line.password, "***");
      out.realAuth = await liveAuth(ruri);
      out.realPlay10 = await get(`http://209.237.141.15:8080${ruri}`);
    }
  }
  console.log(JSON.stringify(out, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
