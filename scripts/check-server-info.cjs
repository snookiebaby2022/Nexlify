#!/usr/bin/env node
const http = require("http");
http.get(
  "http://127.0.0.1:13000/player_api.php?username=_smoke_test&password=SmokeTest2026%21",
  (res) => {
    let body = "";
    res.on("data", (c) => (body += c));
    res.on("end", () => {
      const d = JSON.parse(body);
      console.log(JSON.stringify({ auth: d.user_info?.auth, server_info: d.server_info }, null, 2));
    });
  }
).on("error", (e) => {
  console.error(e.message);
  process.exit(1);
});
