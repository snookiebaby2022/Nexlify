import { spawn, type ChildProcess } from "child_process";
import { Readable } from "stream";
import { ReadableStream } from "stream/web";
import { binExists, getFfmpegPath } from "@/lib/bin-tools";

const remuxProcs = new Map<string, ChildProcess>();

function remuxKey(streamId: string, lineId: string, clientIp?: string): string {
  const ip = clientIp?.trim() || "unknown";
  return `${lineId}:${streamId}:${ip}`;
}

function stopRemux(key: string) {
  const proc = remuxProcs.get(key);
  if (proc) {
    try {
      proc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    remuxProcs.delete(key);
  }
}

function nodeStreamToWeb(
  nodeStream: Readable,
  cleanup: () => void
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => {
        cleanup();
        controller.close();
      });
      nodeStream.on("error", (err) => {
        cleanup();
        controller.error(err);
      });
    },
    cancel() {
      cleanup();
    },
  });
}

export async function canRemuxHlsToMpegTs(): Promise<boolean> {
  try {
    return binExists(await getFfmpegPath());
  } catch {
    return false;
  }
}

/** IPTV apps (Smarters, TiviMate, …) request /live/…/id.ts and expect MPEG-TS, not an m3u8 manifest. */
export async function createHlsToMpegTsStream(opts: {
  hlsUrl: string;
  lineId: string;
  streamId: string;
  clientIp?: string;
  userAgent?: string;
}): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | { error: string }> {
  const key = remuxKey(opts.streamId, opts.lineId, opts.clientIp);

  // Replace any prior remux for this viewer — apps often reopen the same channel without closing first.
  stopRemux(key);

  const ffmpegPath = await getFfmpegPath();
  if (!(await binExists(ffmpegPath))) {
    return { error: "ffmpeg not available for HLS→TS remux" };
  }

  const ua =
    opts.userAgent?.trim() ||
    "Mozilla/5.0 (compatible; Nexlify/1.0; +https://nexlify.live)";

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-user_agent",
    ua,
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5",
    "-probesize",
    "5000000",
    "-analyzeduration",
    "5000000",
    "-i",
    opts.hlsUrl,
    "-map",
    "0:v:0?",
    "-map",
    "0:a:0?",
    "-c",
    "copy",
    "-bsf:v",
    "h264_mp4toannexb",
    "-bsf:a",
    "aac_adtstoasc",
    "-f",
    "mpegts",
    "pipe:1",
  ];

  let proc: ChildProcess | null = spawn(ffmpegPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  if (!proc?.stdout) {
    proc?.kill();
    return { error: "Could not start ffmpeg remux" };
  }

  remuxProcs.set(key, proc);

  const cleanup = () => {
    if (remuxProcs.get(key) === proc) {
      remuxProcs.delete(key);
    }
    if (proc) {
      proc.kill("SIGTERM");
      proc = null;
    }
  };

  return {
    stream: nodeStreamToWeb(proc.stdout, cleanup),
    contentType: "video/mp2t",
  };
}
