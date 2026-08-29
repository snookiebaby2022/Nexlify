#!/usr/bin/env node
const https = require("https");

const url = "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/5";
const headerSets = [
  { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20" },
  { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Referer: "https://junki3monk3y.com/" },
  { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Referer: "http://junki3monk3y.com/c/" },
  { "User-Agent": "Mozilla/5.0", Referer: "https://junki3monk3y.com/" },
  { "User-Agent": "IPTV Smarters Pro", Referer: "https://junki3monk3y.com/" },
];

function tryHeaders(headers) {
  return new Promise((resolve) => {
    https
      .request(url, { method: "GET", headers, timeout: 15000 }, (res) => {
        const chunks = [];
        res.on("data", (c) => {
          if (chunks.length < 3) chunks.push(c);
          if (Buffer.concat(chunks).length > 8192) res.destroy();
        });
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({
            headers,
            status: res.statusCode,
            ct: res.headers["content-type"],
            cl: res.headers["content-length"],
            magic: buf[0] === 0x47 ? "mpegts" : buf.slice(0, 40).toString("utf8").replace(/\s+/g, " "),
            bytes: buf.length,
          });
        });
      })
      .on("error", (e) => resolve({ headers, error: e.message }))
      .end();
  });
}

(async () => {
  for (const h of headerSets) {
    console.log(JSON.stringify(await tryHeaders(h)));
  }
})();
