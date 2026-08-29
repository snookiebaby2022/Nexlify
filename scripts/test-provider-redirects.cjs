#!/usr/bin/env node
const https = require("https");
const http = require("http");

const urls = [
  "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/5",
  "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/5.m3u8",
  "http://junki3monk3y.com/Blade2nd/PaaJhvNbqX/5",
  "http://junki3monk3y.com:80/live/Blade2nd/PaaJhvNbqX/5.ts",
  "https://junki3monk3y.com/live/Blade2nd/PaaJhvNbqX/5.ts",
  "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/1.m3u8",
];

function fetchFollow(url, redirects = 0) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Accept: "*/*" },
        timeout: 15000,
      },
      (res) => {
        const loc = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && loc && redirects < 5) {
          const next = new URL(loc, url).toString();
          res.resume();
          fetchFollow(next, redirects + 1).then((r) => resolve({ ...r, chain: [url, ...(r.chain || [])] }));
          return;
        }
        const chunks = [];
        res.on("data", (c) => {
          if (chunks.length < 3) chunks.push(c);
          if (Buffer.concat(chunks).length > 8192) req.destroy();
        });
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({
            url,
            status: res.statusCode,
            ct: res.headers["content-type"],
            loc,
            magic: buf[0] === 0x47 ? "mpegts" : buf.slice(0, 60).toString("utf8").replace(/\s+/g, " "),
            bytes: buf.length,
          });
        });
      }
    );
    req.on("error", (e) => resolve({ url, error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ url, error: "timeout" });
    });
    req.end();
  });
}

(async () => {
  for (const u of urls) {
    console.log(JSON.stringify(await fetchFollow(u)));
  }
})();
