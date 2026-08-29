#!/usr/bin/env node
/** Verify provider MPEG-TS via 10gbs tinyproxy from panel host. */
const { PrismaClient } = require("@prisma/client");
const http = require("http");
const https = require("https");
const net = require("net");

const p = new PrismaClient();

function connectViaHttpProxy(proxyHost, proxyPort, targetUrl, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const socket = net.connect({ host: proxyHost, port: proxyPort });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("proxy connect timeout"));
    }, timeoutMs);
    socket.once("connect", () => {
      const req = [
        `CONNECT ${parsed.hostname}:${parsed.port || (parsed.protocol === "https:" ? 443 : 80)} HTTP/1.1`,
        `Host: ${parsed.hostname}:${parsed.port || (parsed.protocol === "https:" ? 443 : 80)}`,
        "",
        "",
      ].join("\r\n");
      socket.write(req);
    });
    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (!buf.includes("\r\n\r\n")) return;
      clearTimeout(timer);
      const status = Number(buf.match(/^HTTP\/\d\.\d (\d+)/)?.[1] || 0);
      if (status !== 200) {
        socket.destroy();
        reject(new Error(`CONNECT failed: ${buf.split("\r\n")[0]}`));
        return;
      }
      resolve(socket);
    });
    socket.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function probeDirect(url) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    lib
      .request(
        url,
        {
          method: "GET",
          headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Accept: "*/*" },
          timeout: 20_000,
          rejectUnauthorized: false,
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => {
            chunks.push(c);
            if (Buffer.concat(chunks).length > 8192) res.destroy();
          });
          res.on("close", () => {
            const buf = Buffer.concat(chunks);
            resolve({
              status: res.statusCode,
              ct: res.headers["content-type"],
              bytes: buf.length,
              magic: buf[0] === 0x47 ? "mpegts" : buf.slice(0, 40).toString("utf8").slice(0, 40),
            });
          });
        }
      )
      .on("error", (e) => resolve({ error: e.message }))
      .end();
  });
}

function probeViaProxy(url, proxyHost, proxyPort) {
  return new Promise(async (resolve) => {
    try {
      const parsed = new URL(url);
      const socket = await connectViaHttpProxy(proxyHost, proxyPort, url);
      const lib = parsed.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          socket,
          agent: false,
          method: "GET",
          path: `${parsed.pathname}${parsed.search}`,
          headers: {
            Host: parsed.host,
            "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
            Accept: "*/*",
          },
          timeout: 20_000,
          rejectUnauthorized: false,
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => {
            chunks.push(c);
            if (Buffer.concat(chunks).length > 8192) res.destroy();
          });
          res.on("close", () => {
            const buf = Buffer.concat(chunks);
            resolve({
              status: res.statusCode,
              ct: res.headers["content-type"],
              bytes: buf.length,
              magic: buf[0] === 0x47 ? "mpegts" : buf.slice(0, 40).toString("utf8").slice(0, 40),
            });
          });
        }
      );
      req.on("error", (e) => resolve({ error: e.message }));
      req.end();
    } catch (e) {
      resolve({ error: e.message });
    }
  });
}

(async () => {
  const server = await p.streamServer.findFirst({
    where: { name: "10gbs" },
    include: { proxy: true },
  });
  if (!server?.proxy) {
    console.log("no proxy linked to 10gbs");
    process.exit(1);
  }
  const sample = await p.stream.findFirst({
    where: { type: "LIVE", isActive: true, serverId: server.id, streamUrl: { contains: "junki3monk3y" } },
    select: { name: true, streamUrl: true },
  });
  if (!sample?.streamUrl) {
    console.log("no sample stream");
    process.exit(1);
  }
  const url = sample.streamUrl.trim();
  console.log("direct", sample.name, await probeDirect(url));
  console.log(
    "via_proxy",
    sample.name,
    await probeViaProxy(url, server.proxy.host, server.proxy.port)
  );
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
