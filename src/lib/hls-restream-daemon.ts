import http from "node:http";
import { Readable } from "node:stream";
import { HLS_DAEMON_HOST, HLS_DAEMON_PORT, hlsDaemonToken } from "./hls-disk";
import { ensureTsHlsPackager, isPackagerSegmentName, readTsHlsSegment } from "./ts-hls-packager";
import { createHlsToMpegTsStream } from "./hls-mpegts-relay";
import { openUpstreamLiveStream } from "./live-upstream-proxy";

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

/** One MPEGTS pipe per viewer so Smarters zapping replaces the previous ffmpeg/proxy. */
const mpegtsPipes = new Map<string, () => void>();

function viewerKey(lineId: string, clientIp: string): string {
  return `${lineId}:${clientIp || "unknown"}`;
}

function abortViewerMpegts(key: string) {
  const close = mpegtsPipes.get(key);
  if (!close) return;
  mpegtsPipes.delete(key);
  try {
    close();
  } catch {
    /* ignore */
  }
}

function jsonError(res: http.ServerResponse, status: number, error: string) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error }));
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
    if (req.method === "POST" && url.pathname === "/ensure") {
      const body = await readJson(req);
      const streamId = String(body.streamId ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
      const upstreamUrl = String(body.upstreamUrl ?? "").trim();
      if (!streamId || !/^https?:\/\//i.test(upstreamUrl)) {
        jsonError(res, 400, "invalid stream");
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

    if (req.method === "POST" && url.pathname === "/mpegts") {
      const body = await readJson(req);
      const streamId = String(body.streamId ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
      const lineId = String(body.lineId ?? "daemon").replace(/[^a-zA-Z0-9_-]/g, "") || "daemon";
      const clientIp = String(body.clientIp ?? "").slice(0, 80);
      const upstreamUrl = String(body.upstreamUrl ?? "").trim();
      const userAgent = typeof body.userAgent === "string" ? body.userAgent : undefined;
      const hls = Boolean(body.hls);
      if (!streamId || (!hls && !/^https?:\/\//i.test(upstreamUrl) && !upstreamUrl.startsWith("/"))) {
        jsonError(res, 400, "invalid mpegts request");
        return;
      }

      const key = viewerKey(lineId, clientIp);
      abortViewerMpegts(key);

      const mpegtsHeaders = {
        "Content-Type": "video/mp2t",
        "Cache-Control": "no-cache, no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      };

      const transcode =
        body.transcode && typeof body.transcode === "object"
          ? (body.transcode as {
              resolution: string;
              bitrate: number;
              codec: string;
              gpuAcceleration: boolean;
            })
          : null;
      const forceUniversal = Boolean(body.forceUniversal);

      let source: Readable;
      if (forceUniversal || transcode || hls || upstreamUrl.startsWith("/") || /\.m3u8(?:[?#]|$)/i.test(upstreamUrl)) {
        const remux = await createHlsToMpegTsStream({
          hlsUrl: upstreamUrl,
          lineId,
          streamId,
          clientIp,
          userAgent,
          forceUniversal,
          transcode,
        });
        if ("error" in remux) {
          jsonError(res, 502, remux.error);
          return;
        }
        source = Readable.fromWeb(remux.stream as import("node:stream/web").ReadableStream<Uint8Array>);
      } else {
        const open = await openUpstreamLiveStream(upstreamUrl, {
          userAgent,
          timeoutMs: 8_000,
        });
        source = open.body;
      }

      const close = () => {
        try {
          source.destroy();
        } catch {
          /* ignore */
        }
      };
      mpegtsPipes.set(key, close);
      const drop = () => {
        if (mpegtsPipes.get(key) === close) mpegtsPipes.delete(key);
        close();
      };
      req.on("close", drop);
      res.on("close", drop);
      res.writeHead(200, mpegtsHeaders);
      source.pipe(res);
      console.log(
        `hls-daemon mpegts ${streamId} ${forceUniversal ? "universal" : transcode ? "eco" : hls ? "hls-remux" : "native"}`
      );
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
    if (res.headersSent) {
      res.destroy();
      return;
    }
    jsonError(res, 500, err instanceof Error ? err.message : "daemon error");
  }
});

server.listen(HLS_DAEMON_PORT, HLS_DAEMON_HOST, () => {
  console.log(`nexlify-hls daemon on ${HLS_DAEMON_HOST}:${HLS_DAEMON_PORT}`);
});
