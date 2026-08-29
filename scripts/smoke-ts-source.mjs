#!/usr/bin/env node
/** Loopback-only MPEG-TS test source. Spawns one paced ffmpeg per viewer. */
import http from "node:http";
import { spawn } from "node:child_process";

const port = Number(process.env.NEXLIFY_SMOKE_TS_PORT || 8091);
const bind = process.env.NEXLIFY_SMOKE_TS_BIND || "0.0.0.0";

const server = http.createServer((req, res) => {
  if (req.url !== "/smoke.ts") {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "content-type": "video/mp2t",
    "cache-control": "no-store",
    connection: "close",
  });

  const ffmpeg = spawn(
    "/usr/bin/ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-re",
      "-f",
      "lavfi",
      "-i",
      "smptebars=size=1280x720:rate=25",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:sample_rate=48000",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-tune",
      "zerolatency",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "50",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-f",
      "mpegts",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "ignore"] }
  );

  ffmpeg.stdout.pipe(res);
  const stop = () => {
    if (!ffmpeg.killed) ffmpeg.kill("SIGTERM");
  };
  req.once("close", stop);
  res.once("close", stop);
  ffmpeg.once("exit", () => {
    if (!res.writableEnded) res.end();
  });
});

server.keepAliveTimeout = 5_000;
server.listen(port, bind, () => {
  console.log(`smoke MPEG-TS source listening on ${bind}:${port}`);
});
