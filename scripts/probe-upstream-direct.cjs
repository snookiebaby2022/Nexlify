#!/usr/bin/env node
const https = require("https");
const http = require("http");

const url = process.argv[2] || "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/5";

function fetchFollow(url, redirects = 0) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Accept: "*/*", Connection: "keep-alive", "Icy-MetaData": "0" },
        timeout: 20000,
        rejectUnauthorized: false,
      },
      (res) => {
        const loc = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && loc && redirects < 8) {
          res.resume();
          fetchFollow(new URL(loc, url).toString(), redirects + 1).then(resolve);
          return;
        }
        const chunks = [];
        res.on("data", (c) => {
          chunks.push(c);
          if (Buffer.concat(chunks).length > 131072) req.destroy();
        });
        res.on("close", () => {
          const buf = Buffer.concat(chunks);
          resolve({
            url,
            status: res.statusCode,
            ct: res.headers["content-type"],
            bytes: buf.length,
            magic: buf[0] === 0x47 ? "mpegts" : buf.slice(0, 50).toString("utf8"),
          });
        });
      }
    );
    req.on("error", (e) => resolve({ url, error: e.message }));
    req.end();
  });
}

fetchFollow(url).then((r) => console.log(JSON.stringify(r, null, 2)));
