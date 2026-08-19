import { spawn, type ChildProcess } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "fs";
import { join } from "path";
import { binExists, getFfmpegPath } from "@/lib/bin-tools";
import { hlsStreamDir } from "@/lib/hls-disk";

/** Short segments so the first playlist is ready before XCIPTV's ~10s HLS timeout. */
const HLS_TIME_SEC = 1;
const HLS_LIST_SIZE = 6;
const READY_TIMEOUT_MS = 12_000;
const MAX_SESSIONS = 32;
const IDLE_MS = 10 * 60 * 1000;
const REAP_EVERY_MS = 30_000;

export function isPackagerSegmentName(name: string): boolean {
  return /^seg\d+\.ts$/i.test(name.trim());
}

export function filterPackagerPlaylistToExisting(playlist: string, lineId: string, streamId: string): string {
  const dir = packagerDir(lineId, streamId);
  const lines = playlist.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#EXT-X-DISCONTINUITY")) continue;
    const name = trimmed.split(/[\\/]/).pop() ?? "";
    if (isPackagerSegmentName(name)) {
      if (!existsSync(join(dir, name))) {
        if (out.length && out[out.length - 1]!.startsWith("#EXTINF")) out.pop();
        continue;
      }
    }
    out.push(line);
  }
  return out.join("\n");
}

export function packagerDir(_lineId: string, streamId: string): string {
  return hlsStreamDir(streamId);
}

type PackagerSession = {
  key: string;
  dir: string;
  proc: ChildProcess;
  lastAccess: number;
  ready: Promise<boolean>;
  upstreamUrl: string;
  fingerprint: string;
};

const globalKey = "__nexlifyTsHlsSessions";
const sessions: Map<string, PackagerSession> = ((globalThis as Record<string, unknown>)[globalKey] as
  | Map<string, PackagerSession>
  | undefined) ?? new Map();
(globalThis as Record<string, unknown>)[globalKey] = sessions;
let reaperStarted = false;

function sessionKey(_lineId: string, streamId: string): string {
  // XUI on-demand: one ffmpeg per stream, shared by every line/device.
  return streamId;
}

function startReaper() {
  if (reaperStarted) return;
  reaperStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, session] of [...sessions.entries()]) {
      if (now - session.lastAccess < IDLE_MS) continue;
      stopSession(key);
    }
  }, REAP_EVERY_MS).unref();
}

function evictOldestIfNeeded() {
  if (sessions.size < MAX_SESSIONS) return;
  let oldest: PackagerSession | undefined;
  for (const session of sessions.values()) {
    if (!oldest || session.lastAccess < oldest.lastAccess) oldest = session;
  }
  if (oldest) stopSession(oldest.key);
}

function stopSession(key: string) {
  const session = sessions.get(key);
  if (!session) return;
  sessions.delete(key);
  try {
    const pid = session.proc.pid;
    if (pid) {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        session.proc.kill("SIGTERM");
      }
    }
  } catch {
    /* ignore */
  }
  try {
    rmSync(session.dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/** Live HTTP input is already realtime — `-re` delays the first HLS segment by a full GOP. */
export function packagerLiveInputPrefix(opts?: { loop?: boolean; vod?: boolean }): string[] {
  if (opts?.loop) return ["-re", "-stream_loop", "-1"];
  if (opts?.vod) return ["-re"];
  return [];
}

export function packagerPlaylistIsReady(dir: string): boolean {
  const indexPath = join(dir, "index.m3u8");
  try {
    if (!existsSync(indexPath) || statSync(indexPath).size <= 24) return false;
    const body = readFileSync(indexPath, "utf8");
    if (!body.includes("#EXTINF")) return false;
    const segs = body.match(/seg\d+\.ts/gi) ?? [];
    for (const name of segs) {
      const path = join(dir, name);
      if (existsSync(path) && statSync(path).size >= 188) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function waitForPlaylist(dir: string, proc: ChildProcess, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (proc.exitCode != null && proc.exitCode !== 0) {
        resolve(false);
        return;
      }
      if (packagerPlaylistIsReady(dir)) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 150);
    };
    tick();
  });
}

export type PackagerTranscode = {
  resolution: string;
  bitrate: number;
  codec: string;
  gpuAcceleration: boolean;
} | null;

function packagerFingerprint(
  upstreamUrl: string,
  transcode: PackagerTranscode,
  loop?: boolean,
  vod?: boolean
) {
  return JSON.stringify({
    u: upstreamUrl,
    t: transcode
      ? `${transcode.codec}:${transcode.resolution}:${transcode.bitrate}:${transcode.gpuAcceleration}`
      : "copy",
    loop: Boolean(loop),
    vod: Boolean(vod),
  });
}

function transcodeArgs(profile: PackagerTranscode): string[] {
  if (!profile) return ["-c", "copy"];
  const vcodec =
    profile.gpuAcceleration && profile.codec !== "h265"
      ? "h264_nvenc"
      : profile.codec === "h265"
        ? "libx265"
        : "libx264";
  return [
    "-c:v",
    vcodec,
    "-b:v",
    `${Math.max(300, Number(profile.bitrate) || 2500)}k`,
    "-s",
    profile.resolution || "1280x720",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
  ];
}

async function spawnPackager(
  key: string,
  dir: string,
  upstreamUrl: string,
  opts?: { userAgent?: string; loop?: boolean; transcode?: PackagerTranscode; vod?: boolean }
): Promise<PackagerSession | null> {
  const ffmpegPath = await getFfmpegPath();
  if (!(await binExists(ffmpegPath))) return null;

  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  mkdirSync(dir, { recursive: true });

  const ua = opts?.userAgent?.trim() || "VLC/3.0.20 LibVLC/3.0.20";
  const inputPrefix = packagerLiveInputPrefix(opts);
  const hlsFlags = opts?.vod ? "temp_file" : "omit_endlist+temp_file";
  const listSize = opts?.vod ? "0" : String(HLS_LIST_SIZE);
  const fingerprint = packagerFingerprint(upstreamUrl, opts?.transcode ?? null, opts?.loop, opts?.vod);
  const liveTune = opts?.vod ? [] : ["-flags", "low_delay"];

  const proc = spawn(
    ffmpegPath,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-user_agent",
      ua,
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_at_eof",
      "1",
      "-reconnect_delay_max",
      "2",
      "-rw_timeout",
      "15000000",
      "-probesize",
      "327680",
      "-analyzeduration",
      "500000",
      "-fflags",
      "+genpts+discardcorrupt",
      "-avoid_negative_ts",
      "make_zero",
      ...inputPrefix,
      "-i",
      upstreamUrl,
      ...transcodeArgs(opts?.transcode ?? null),
      ...liveTune,
      "-f",
      "hls",
      "-hls_time",
      String(HLS_TIME_SEC),
      "-hls_list_size",
      listSize,
      "-hls_allow_cache",
      opts?.vod ? "1" : "0",
      "-hls_segment_type",
      "mpegts",
      "-hls_flags",
      hlsFlags,
      "-hls_segment_filename",
      join(dir, "seg%d.ts"),
      join(dir, "index.m3u8"),
    ],
    { stdio: ["ignore", "ignore", "ignore"], windowsHide: true, detached: true }
  );
  try {
    proc.unref();
  } catch {
    /* ignore */
  }

  proc.on("exit", () => {
    if (sessions.get(key)?.proc === proc) sessions.delete(key);
  });

  const session: PackagerSession = {
    key,
    dir,
    proc,
    lastAccess: Date.now(),
    ready: waitForPlaylist(dir, proc, READY_TIMEOUT_MS),
    upstreamUrl,
    fingerprint,
  };
  sessions.set(key, session);
  startReaper();
  return session;
}

export async function ensureTsHlsPackager(opts: {
  upstreamUrl: string;
  lineId: string;
  streamId: string;
  userAgent?: string;
  loop?: boolean;
  transcode?: PackagerTranscode;
  vod?: boolean;
}): Promise<{ ok: true; playlist: string } | { ok: false; error: string }> {
  const key = sessionKey(opts.lineId, opts.streamId);
  const dir = packagerDir(opts.lineId, opts.streamId);
  const fingerprint = packagerFingerprint(opts.upstreamUrl, opts.transcode ?? null, opts.loop, opts.vod);
  let session = sessions.get(key);

  if (session && session.proc.exitCode != null) {
    stopSession(key);
    session = undefined;
  }
  if (session && session.fingerprint !== fingerprint) {
    stopSession(key);
    session = undefined;
  }

  if (!session) {
    evictOldestIfNeeded();
    const created = await spawnPackager(key, dir, opts.upstreamUrl, {
      userAgent: opts.userAgent,
      loop: opts.loop,
      transcode: opts.transcode,
      vod: opts.vod,
    });
    if (!created) return { ok: false, error: "ffmpeg not available for HLS packaging" };
    session = created;
  }

  session.lastAccess = Date.now();
  const ready = await session.ready;
  if (!ready) {
    stopSession(key);
    return { ok: false, error: "HLS packager timed out" };
  }

  try {
    const playlist = filterPackagerPlaylistToExisting(
      readFileSync(join(session.dir, "index.m3u8"), "utf8"),
      opts.lineId,
      opts.streamId
    );
    if (!playlist.includes("#EXTM3U") || !/seg\d+\.ts/i.test(playlist)) {
      return { ok: false, error: "Invalid HLS playlist" };
    }
    return { ok: true, playlist };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to read HLS playlist" };
  }
}

/** Absolute path to an on-disk index.m3u8 if the packager/daemon already produced one. */
export function localHlsIndexPath(streamId: string): string | null {
  const dir = hlsStreamDir(streamId);
  const indexPath = join(dir, "index.m3u8");
  try {
    if (existsSync(indexPath) && statSync(indexPath).size > 24) return indexPath;
  } catch {
    /* ignore */
  }
  return null;
}

export function readTsHlsSegment(lineId: string, streamId: string, name: string): Buffer | null {
  if (!isPackagerSegmentName(name)) return null;
  const key = sessionKey(lineId, streamId);
  const session = sessions.get(key);
  if (session) session.lastAccess = Date.now();
  const dir = session?.dir ?? packagerDir(lineId, streamId);
  const path = join(dir, name);
  if (!path.startsWith(dir)) return null;
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path);
  } catch {
    return null;
  }
}
