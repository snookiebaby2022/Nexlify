#!/usr/bin/env node
/** POST /api/auth/login with bad creds — expect 401 not 500. */
const http = require("http");
const body = JSON.stringify({ username: "probe_invalid_user", password: "probe" });
const req = http.request(
  {
    hostname: "127.0.0.1",
    port: Number(process.env.PORT || 13000),
    path: "/api/auth/login",
    method: "POST",
    headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
  },
  (res) => {
    let data = "";
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      console.log(JSON.stringify({ status: res.statusCode, body: data.slice(0, 500) }, null, 2));
      process.exit(res.statusCode === 401 || res.statusCode === 429 ? 0 : 1);
    });
  }
);
req.on("error", (e) => {
  console.error(e);
  process.exit(1);
});
req.write(body);
req.end();
