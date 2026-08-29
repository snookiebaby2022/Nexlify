#!/usr/bin/env node
const https = require("https");
const http = require("http");
const url = process.argv[2] || "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/5";

function go(target, hop) {
  return new Promise((resolve) => {
    const u = new URL(target);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      target,
      { method: "GET", headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Accept: "*/*", Connection: "close" }, timeout: 20000, agent: false, rejectUnauthorized: false },
      (res) => {
        const loc = res.headers.location;
        console.log(`hop ${hop} ${res.statusCode} ${target.slice(0, 90)}${loc ? " -> " + loc.slice(0, 90) : ""}`);
        if (res.statusCode >= 300 && res.statusCode < 400 && loc && hop < 12) {
          res.resume();
          go(new URL(loc, target).toString(), hop + 1).then(resolve);
          return;
        }
        const chunks = [];
        res.on("data", (c) => {
          chunks.push(c);
          if (Buffer.concat(chunks).length > 131072) req.destroy();
        });
        res.on("close", () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, ct: res.headers["content-type"], bytes: buf.length, ts: buf[0] === 0x47 });
        });
      }
    );
    req.on("error", (e) => resolve({ error: e.message }));
    req.end();
  });
}

go(url, 0).then((r) => console.log(JSON.stringify(r, null, 2)));
