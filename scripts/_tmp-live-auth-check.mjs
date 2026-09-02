#!/usr/bin/env node
import { readFileSync } from "node:fs";
import http from "node:http";

const env = readFileSync("/opt/nexlify-panel/.env", "utf8");
const m = env.match(/^PANEL_INTERNAL_SECRET="?([^"\n]+)"?/m);
const secret = m?.[1] || "";

const paths = [
  { label: "BBC-OD", path: "/live/c56jaci21o/wcmpuUFJaSxb/1156229205.ts" },
  { label: "BBC-LIVE", path: "/live/c56jaci21o/wcmpuUFJaSxb/101673249.ts" },
  { label: "ITV", path: "/live/c56jaci21o/wcmpuUFJaSxb/310966199.ts" },
];

function auth(path) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 13000,
        path: "/api/internal/live-auth",
        method: "GET",
        headers: {
          "x-panel-internal-secret": secret,
          "x-original-uri": path,
          "x-original-method": "GET",
          "user-agent": "VLC/3.0.20",
        },
        timeout: 10000,
      },
      (res) => {
        const h = res.headers;
        res.resume();
        resolve({
          status: res.statusCode,
          live: h["x-nexlify-live"],
          upstream: h["x-nexlify-upstream"] || null,
          passthrough: h["x-nexlify-passthrough"],
          streamId: h["x-nexlify-stream-id"],
        });
      }
    );
    req.on("error", (e) => resolve({ error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ error: "timeout" });
    });
    req.end();
  });
}

for (const p of paths) {
  console.log(p.label, JSON.stringify(await auth(p.path)));
}
