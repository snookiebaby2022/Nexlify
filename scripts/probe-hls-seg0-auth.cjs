#!/usr/bin/env node
/** One-shot: print live-auth upstream + proxy for an HLS playlist path. */
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = process.argv[2] || "/opt/nexlify-panel";
const uri =
  process.argv[3] || "/live/lucky15/chedpie30/1963076578.m3u8";
const envPath = path.join(root, ".env");
const secret =
  process.env.NEXLIFY_INTERNAL_SECRET ||
  fs.readFileSync(envPath, "utf8").match(/^NEXLIFY_INTERNAL_SECRET=(.+)$/m)?.[1]?.trim();

if (!secret) {
  console.error("missing NEXLIFY_INTERNAL_SECRET");
  process.exit(1);
}

const backend = process.env.IPTV_EDGE_BACKEND || "127.0.0.1:13000";
const [host, port] = backend.split(":");

http
  .request(
    {
      hostname: host,
      port: Number(port),
      path: "/api/internal/live-auth",
      method: "GET",
      headers: {
        "x-panel-internal-secret": secret,
        "x-original-uri": uri,
        "x-original-method": "GET",
        "user-agent": "IPTV Smarters Pro",
      },
      timeout: 15_000,
    },
    (res) => {
      console.log("status", res.statusCode);
      for (const k of [
        "x-nexlify-upstream",
        "x-nexlify-outbound-proxy",
        "x-nexlify-stream-id",
        "x-nexlify-hls-native",
        "x-nexlify-passthrough",
      ]) {
        console.log(k, res.headers[k] || "");
      }
      res.resume();
    }
  )
  .on("error", (e) => {
    console.error(e.message);
    process.exit(1);
  })
  .end();
