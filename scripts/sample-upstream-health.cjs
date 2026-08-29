#!/usr/bin/env node
/** Sample live upstream URLs — how many actually return MPEG-TS? */
const { PrismaClient } = require("@prisma/client");
const https = require("https");
const http = require("http");

const p = new PrismaClient();
const SAMPLE = Number(process.argv[2] || 30);

function headGet(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        timeout: timeoutMs,
        headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Accept: "*/*" },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => {
          if (chunks.length < 2) chunks.push(c);
          if (Buffer.concat(chunks).length >= 4096) req.destroy();
        });
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            ct: res.headers["content-type"] || "",
            magic: buf[0] === 0x47 ? "mpegts" : buf.slice(0, 20).toString("utf8").replace(/\s+/g, " ").slice(0, 40),
            bytes: buf.length,
          });
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
  const providers = await p.streamProvider.findMany({
    select: { id: true, name: true, baseUrl: true, providerType: true, status: true },
    take: 10,
  });
  console.log("providers:", JSON.stringify(providers, null, 2));

  const streams = await p.stream.findMany({
    where: { type: "LIVE", isActive: true, streamUrl: { startsWith: "http" } },
    select: { id: true, name: true, streamUrl: true, providerId: true, providerPath: true, hostedExternally: true },
    take: SAMPLE,
    orderBy: { updatedAt: "desc" },
  });

  let ok = 0;
  let html = 0;
  let fail = 0;
  for (const s of streams) {
    const r = await headGet(s.streamUrl.trim());
    const good = r.magic === "mpegts";
    if (good) ok++;
    else if (String(r.ct).includes("html") || String(r.magic).includes("<")) html++;
    else fail++;
    console.log(JSON.stringify({ name: s.name.slice(0, 40), url: s.streamUrl.slice(-30), ...r, good }));
  }
  console.log(JSON.stringify({ sampled: streams.length, mpegts: ok, htmlEmpty: html, otherFail: fail }, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
