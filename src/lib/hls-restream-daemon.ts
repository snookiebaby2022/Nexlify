import http from "node:http";
import { HLS_DAEMON_HOST, HLS_DAEMON_PORT, hlsDaemonToken } from "./hls-disk";
import { ensureTsHlsPackager, isPackagerSegmentName, readTsHlsSegment, startTsHlsPackager } from "./ts-hls-packager";

function unauthorized(res: http.ServerResponse) {
  res.writeHead(401, { "Content-Type": "text/plain" });
  res.end("unauthorized");
}

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function authed(req: http.IncomingMessage): boolean {
  const hdr = req.headers.authorization ?? "";
  const token = hdr.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === hlsDaemonToken();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HLS_DAEMON_HOST}`);
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  if (!authed(req)) {
    unauthorized(res);
    return;
  }

  try {
    if (req.method === "POST" && url.pathname === "/start") {
      const body = await readJson(req);
      const streamId = String(body.streamId ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
      const upstreamUrl = String(body.upstreamUrl ?? "").trim();
      if (!streamId || !/^https?:\/\//i.test(upstreamUrl)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid stream" }));
        return;
      }
      void startTsHlsPackager({
        upstreamUrl,
        lineId: "daemon",
        streamId,
        userAgent: typeof body.userAgent === "string" ? body.userAgent : undefined,
        loop: Boolean(body.loop),
        vod: Boolean(body.vod),
        transcode:
          body.transcode && typeof body.transcode === "object"
            ? (body.transcode as {
                resolution: string;
                bitrate: number;
                codec: string;
                gpuAcceleration: boolean;
              })
            : null,
      }).catch(() => undefined);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, started: true }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/ensure") {
      const body = await readJson(req);
      const streamId = String(body.streamId ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
      const upstreamUrl = String(body.upstreamUrl ?? "").trim();
      if (!streamId || !/^https?:\/\//i.test(upstreamUrl)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid stream" }));
        return;
      }
      const packed = await ensureTsHlsPackager({
        upstreamUrl,
        lineId: "daemon",
        streamId,
        userAgent: typeof body.userAgent === "string" ? body.userAgent : undefined,
        loop: Boolean(body.loop),
        vod: Boolean(body.vod),
        transcode:
          body.transcode && typeof body.transcode === "object"
            ? (body.transcode as {
                resolution: string;
                bitrate: number;
                codec: string;
                gpuAcceleration: boolean;
              })
            : null,
      });
      console.log(`hls-daemon ensure ${streamId} ${packed.ok ? "ok" : packed.error}`);
      res.writeHead(packed.ok ? 200 : 502, { "Content-Type": "application/json" });
      res.end(JSON.stringify(packed));
      return;
    }

    const seg = url.pathname.match(/^\/segment\/([^/]+)\/([^/]+)$/);
    if (req.method === "GET" && seg) {
      const buf = readTsHlsSegment("daemon", seg[1]!, seg[2]!);
      if (!buf || !isPackagerSegmentName(seg[2]!)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "video/mp2t", "Cache-Control": "no-cache" });
      res.end(buf);
      return;
    }

    res.writeHead(404);
    res.end("not found");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "daemon error" }));
  }
});

server.listen(HLS_DAEMON_PORT, HLS_DAEMON_HOST, () => {
  console.log(`nexlify-hls daemon on ${HLS_DAEMON_HOST}:${HLS_DAEMON_PORT}`);
});
