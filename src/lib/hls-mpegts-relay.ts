import { spawn, type ChildProcess } from "child_process";
import { Readable } from "stream";
import { ReadableStream } from "stream/web";
import { liveTranscodeCodecArgs } from "@/lib/live-transcode";
import { binExists, getFfmpegPath } from "@/lib/bin-tools";

const remuxProcs = new Map<string, ChildProcess>();
const MAX_REMUX = 24;

/** One MPEGTS ffmpeg per viewer (line+IP). Zapping must replace the previous process. */
function remuxKey(_streamId: string, lineId: string, clientIp?: string): string {
  const ip = clientIp?.trim() || "unknown";
  return `${lineId}:${ip}`;
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
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          nodeStream.destroy();
          return;
        }
        if (controller.desiredSize !== null && controller.desiredSize <= 0) {
          nodeStream.pause();
        }
      });
      nodeStream.on("end", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
      nodeStream.on("error", (err) => {
        cleanup();
        try {
          controller.error(err);
        } catch {
          /* ignore */
        }
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
  transcode?: {
    resolution: string;
    bitrate: number;
    codec: string;
    gpuAcceleration: boolean;
  } | null;
}): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | { error: string }> {
  const key = remuxKey(opts.streamId, opts.lineId, opts.clientIp);

  // Replace any prior remux for this viewer — apps often reopen the same channel without closing first.
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
  const tlsArgs = !isLocalFile && /^https:/i.test(opts.hlsUrl) ? ["-tls_verify", "0"] : [];
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
        ...tlsArgs,
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
    opts.transcode ? "200000" : "200000",
    ...inputArgs,
    "-map",
    "0:v:0?",
    "-map",
    "0:a:0?",
    ...(opts.transcode ? liveTranscodeCodecArgs(opts.transcode) : ["-c", "copy"]),
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
