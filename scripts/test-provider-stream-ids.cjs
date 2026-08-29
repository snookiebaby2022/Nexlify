#!/usr/bin/env node
/** Match Nexlify streams to provider stream_ids and test playback. */
const https = require("https");
const fs = require("fs");

const U = "Blade2nd";
const P = "PaaJhvNbqX";
const HOST = "junki3monk3y.com";

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "VLC/3.0.20" }, timeout: 20000 }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      })
      .on("error", reject);
  });
}

function testPlay(id) {
  return new Promise((resolve) => {
    const url = `https://${HOST}/${U}/${P}/${id}`;
    https
      .request(
        url,
        { method: "GET", headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20" }, timeout: 12000 },
        (res) => {
          const chunks = [];
          res.on("data", (c) => {
            if (chunks.length < 2) chunks.push(c);
            if (Buffer.concat(chunks).length > 4096) res.destroy();
          });
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            resolve({
              id,
              status: res.statusCode,
              ct: res.headers["content-type"],
              magic: buf[0] === 0x47 ? "mpegts" : buf.slice(0, 30).toString("utf8").slice(0, 40),
              bytes: buf.length,
            });
          });
        }
      )
      .on("error", (e) => resolve({ id, error: e.message }))
      .end();
  });
}

(async () => {
  const catalog = JSON.parse(
    (await get(`https://${HOST}/player_api.php?username=${U}&password=${P}&action=get_live_streams`)).body.toString("utf8")
  );
  console.log("catalog_count", catalog.length);

  for (const name of ["BBC One FHD", "BBC Two HD", "ITV1 HD"]) {
    const row = catalog.find((x) => x.name === name) || catalog.find((x) => x.name?.includes(name.split(" ")[0]));
    console.log("match", name, row ? { stream_id: row.stream_id, name: row.name } : "NOT FOUND");
    if (row) console.log("play", await testPlay(row.stream_id));
  }

  for (const id of [1, 2, 3, 5, 56209, 51849]) {
    console.log("play", await testPlay(id));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
