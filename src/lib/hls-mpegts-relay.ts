import { spawn, type ChildProcess } from "child_process";
import { Readable } from "stream";
import { ReadableStream } from "stream/web";
import { binExists, getFfmpegPath } from "@/lib/bin-tools";

const remuxProcs = new Map<string, ChildProcess>();
const MAX_REMUX = 24;

function remuxKey(streamId: string): string {
  return streamId;
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
        if (controller.desiredSize !== null && controller.desiredSize <= 0) {
          nodeStream.pause();
        }
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
    pull() {
      nodeStream.resume();
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
  const key = remuxKey(opts.streamId);

  // Replace prior remux for this channel (shared key — warm slot reused on zap-back when within MAX_REMUX).
  stopRemux(key);
  if (remuxProcs.size >= MAX_REMUX) {
    const oldest = remuxProcs.keys().next().value;
    if (typeof oldest === "string") stopRemux(oldest);
  }

  const ffmpegPath = await getFfmpegPath();
  if (!(await binExists(ffmpegPath))) {
    return { error: "ffmpeg not available for HLS→TS remux" };
  }

  const ua =
    opts.userAgent?.trim() ||
    "Mozilla/5.0 (compatible; Nexlify/1.0; +https://nexlify.live)";

  const isLocalFile = opts.hlsUrl.startsWith("/") || opts.hlsUrl.startsWith("file:");
  const inputArgs = isLocalFile
    ? ["-i", opts.hlsUrl]
    : [
        "-user_agent",
        ua,
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "5",
        "-i",
        opts.hlsUrl,
      ];

  // MPEG-TS output: do NOT use aac_adtstoasc (MP4/FLV only) or a fixed h264_mp4toannexb
  // (breaks HEVC → audio-only / no picture on VLC & Exo). Let ffmpeg pick bitstream filters.
  // Small probesize so VLC/Exo get the first 0x47 sync bytes in <1s.
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-fflags",
    "+nobuffer+discardcorrupt",
    "-flags",
    "low_delay",
    "-probesize",
    "32768",
    "-analyzeduration",
    "100000",
    ...inputArgs,
    "-map",
    "0:v:0?",
    "-map",
    "0:a:0?",
    "-c",
    "copy",
    "-flush_packets",
    "1",
    "-muxdelay",
    "0",
    "-muxpreload",
    "0",
    "-mpegts_flags",
    "+resend_headers",
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
