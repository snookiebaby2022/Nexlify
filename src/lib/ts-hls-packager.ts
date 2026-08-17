import { spawn, type ChildProcess } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { binExists, getFfmpegPath } from "@/lib/bin-tools";
import { hlsStreamDir } from "@/lib/hls-disk";
import { liveTranscodeCodecArgs, type LiveTranscodeProfile } from "@/lib/live-transcode";

export { localHlsIndexPath } from "@/lib/hls-disk";

/** 2s segments — copy mode splits on keyframes; 1s often still yields ~2s GOPs. */
const HLS_TIME_SEC = 2;
const HLS_LIST_SIZE = 10;
/** Ignore segments ffmpeg is still flushing to disk (temp_file rename). */
const SEGMENT_FLUSH_MS = 500;
/** ExoPlayer live starts after ~3× TARGETDURATION; wait for a real window, not one leftover file. */
const LIVE_MIN_SEGMENTS = 3;
const READY_TIMEOUT_MS = 18_000;
const LIVE_PLAYLIST_MAX_AGE_MS = 15_000;
const MAX_SESSIONS = 32;
const IDLE_MS = 10 * 60 * 1000;
const REAP_EVERY_MS = 30_000;

export function isPackagerSegmentName(name: string): boolean {
  return /^seg\d+\.ts$/i.test(name.trim());
}

export function packagerSegmentNameForIndex(index: number): string {
  return `seg${index}.ts`;
}

export function segmentIndexFromPackagerName(name: string): number | null {
  const m = /^seg(\d+)\.ts$/i.exec(name.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

export function packagerPlaylistSegmentNames(playlist: string): string[] {
  const names: string[] = [];
  for (const line of playlist.split("\n")) {
    const name = line.trim().split(/[\\/]/).pop() ?? "";
    if (isPackagerSegmentName(name)) names.push(name);
  }
  return names;
}

/** After dropping missing files, MEDIA-SEQUENCE must match the first remaining segN.ts. */
export function alignPackagerMediaSequence(playlist: string): string {
  const names = packagerPlaylistSegmentNames(playlist);
  if (!names.length) return playlist;
  const num = Number(/^seg(\d+)\.ts$/i.exec(names[0]!)?.[1]);
  if (!Number.isFinite(num)) return playlist;
  const lines = playlist.split("\n");
  let replaced = false;
  const out = lines.map((line) => {
    if (!line.trim().startsWith("#EXT-X-MEDIA-SEQUENCE:")) return line;
    replaced = true;
    return `#EXT-X-MEDIA-SEQUENCE:${num}`;
  });
  if (!replaced) {
    const i = out.findIndex((l) => l.trim().startsWith("#EXT-X-TARGETDURATION"));
    out.splice(i >= 0 ? i + 1 : 1, 0, `#EXT-X-MEDIA-SEQUENCE:${num}`);
  }
  return out.join("\n");
}

export function filterPackagerPlaylistToExisting(playlist: string, lineId: string, streamId: string): string {
  const dir = packagerDir(lineId, streamId);
  const lines = playlist.split("\n");
  const out: string[] = [];
  const pendingSegs: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#EXT-X-DISCONTINUITY")) continue;
    const name = trimmed.split(/[\\/]/).pop() ?? "";
    if (isPackagerSegmentName(name)) pendingSegs.push(name);
    out.push(line);
  }
  // Only drop the newest segment while ffmpeg is still flushing it — not every young file.
  const dropLast = (() => {
    if (!pendingSegs.length) return null;
    const last = pendingSegs[pendingSegs.length - 1]!;
    const segPath = join(dir, last);
    try {
      if (existsSync(segPath) && Date.now() - statSync(segPath).mtimeMs < SEGMENT_FLUSH_MS) return last;
    } catch {
      return last;
    }
    return null;
  })();

  const filtered: string[] = [];
  for (const line of out) {
    const trimmed = line.trim();
    const name = trimmed.split(/[\\/]/).pop() ?? "";
    if (isPackagerSegmentName(name)) {
      const segPath = join(dir, name);
      if (!existsSync(segPath)) {
        if (filtered.length && filtered[filtered.length - 1]!.startsWith("#EXTINF")) filtered.pop();
        continue;
      }
      if (name === dropLast) {
        if (filtered.length && filtered[filtered.length - 1]!.startsWith("#EXTINF")) filtered.pop();
        continue;
      }
    }
    filtered.push(line);
  }
  return alignPackagerMediaSequence(filtered.join("\n"));
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
  vod: boolean;
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
      if (session.vod) {
        const finished = tryReadReadyPlaylist("daemon", session.key, { vod: true });
        if (finished?.includes("#EXT-X-ENDLIST")) {
          stopSession(key, true);
          continue;
        }
      }
      if (now - session.lastAccess < IDLE_MS) continue;
      stopSession(key, Boolean(session.vod));
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

function fingerprintPath(dir: string): string {
  return join(dir, ".nexlify-fingerprint");
}

function writeFingerprint(dir: string, fingerprint: string) {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(fingerprintPath(dir), fingerprint, "utf8");
  } catch {
    /* ignore */
  }
}

function readFingerprint(dir: string): string | null {
  try {
    return readFileSync(fingerprintPath(dir), "utf8");
  } catch {
    return null;
  }
}

function tryReadReadyPlaylist(
  lineId: string,
  streamId: string,
  opts?: { vod?: boolean; sessionAlive?: boolean }
): string | null {
  try {
    const dir = packagerDir(lineId, streamId);
    const indexPath = join(dir, "index.m3u8");
    if (!existsSync(indexPath) || statSync(indexPath).size <= 24) return null;
    if (!opts?.vod && !opts?.sessionAlive) {
      const ageMs = Date.now() - statSync(indexPath).mtimeMs;
      if (ageMs > LIVE_PLAYLIST_MAX_AGE_MS) return null;
    }
    const playlist = filterPackagerPlaylistToExisting(readFileSync(indexPath, "utf8"), lineId, streamId);
    if (!playlist.includes("#EXTM3U") || !/seg\d+\.ts/i.test(playlist)) return null;
    const segs = packagerPlaylistSegmentNames(playlist);
    const minSegs = opts?.vod ? 1 : LIVE_MIN_SEGMENTS;
    if (segs.length < minSegs) {
      if (!opts?.vod) {
        try {
          rmSync(indexPath, { force: true });
        } catch {
          /* ignore */
        }
      }
      return null;
    }
    return playlist;
  } catch {
    return null;
  }
}

function stopSession(key: string, keepDir = false) {
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
  if (keepDir) return;
  try {
    rmSync(session.dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function waitForPlaylist(dir: string, proc: ChildProcess, timeoutMs: number, minSegs: number): Promise<boolean> {
  const indexPath = join(dir, "index.m3u8");
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (proc.exitCode != null && proc.exitCode !== 0) {
        resolve(false);
        return;
      }
      try {
        if (existsSync(indexPath) && statSync(indexPath).size > 24) {
          const body = readFileSync(indexPath, "utf8");
          const segs = body.match(/seg\d+\.ts/gi) ?? [];
          const onDisk = segs.filter((name) => existsSync(join(dir, name)));
          if (body.includes("#EXTINF") && onDisk.length >= minSegs) {
            resolve(true);
            return;
          }
        }
      } catch {
        /* retry */
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

export type PackagerTranscode = LiveTranscodeProfile | null;

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

/** Live HTTP and VOD copy as fast as the source allows. `-re` only for looping created-channel files. */
export function packagerFfmpegInputPrefix(opts: { loop?: boolean; vod?: boolean }): string[] {
  if (opts.loop) return ["-re", "-stream_loop", "-1"];
  return [];
}

function transcodeArgs(profile: PackagerTranscode): string[] {
  if (!profile) return ["-c", "copy"];
  return liveTranscodeCodecArgs(profile);
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
  const inputPrefix = packagerFfmpegInputPrefix({ loop: opts?.loop, vod: opts?.vod });
  const hlsFlags = opts?.vod ? "independent_segments+temp_file" : "delete_segments+omit_endlist+temp_file";
  const listSize = opts?.vod ? "0" : String(HLS_LIST_SIZE);
  const fingerprint = packagerFingerprint(upstreamUrl, opts?.transcode ?? null, opts?.loop, opts?.vod);
  const tlsArgs = /^https:/i.test(upstreamUrl) ? ["-tls_verify", "0"] : [];
  writeFingerprint(dir, fingerprint);

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
      opts?.vod ? "500000" : "32768",
      "-analyzeduration",
      opts?.vod ? "500000" : "200000",
      "-fflags",
      opts?.vod ? "+genpts+discardcorrupt" : "+nobuffer+flush_packets+genpts+discardcorrupt",
      "-flags",
      "low_delay",
      "-avoid_negative_ts",
      "make_zero",
      ...tlsArgs,
      ...inputPrefix,
      "-i",
      upstreamUrl,
      ...transcodeArgs(opts?.transcode ?? null),
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
    ready: waitForPlaylist(dir, proc, READY_TIMEOUT_MS, opts?.vod ? 1 : LIVE_MIN_SEGMENTS),
    upstreamUrl,
    fingerprint,
    vod: Boolean(opts?.vod),
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
    stopSession(key, Boolean(opts.vod));
    session = undefined;
  }
  if (session && session.fingerprint !== fingerprint) {
    stopSession(key);
    session = undefined;
  }

  const existing = tryReadReadyPlaylist(opts.lineId, opts.streamId, {
    vod: opts.vod,
    sessionAlive: Boolean(session),
  });
  const sameFingerprint = readFingerprint(dir) === fingerprint;
  if (opts.vod && existing && sameFingerprint && existing.includes("#EXT-X-ENDLIST")) {
    return { ok: true, playlist: existing };
  }
  if (existing && sameFingerprint && session) {
    session.lastAccess = Date.now();
    return { ok: true, playlist: existing };
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
  const already = tryReadReadyPlaylist(opts.lineId, opts.streamId, {
    vod: opts.vod,
    sessionAlive: true,
  });
  if (already) return { ok: true, playlist: already };

  const ready = await session.ready;
  const afterWait = tryReadReadyPlaylist(opts.lineId, opts.streamId, {
    vod: opts.vod,
    sessionAlive: true,
  });
  if (afterWait) return { ok: true, playlist: afterWait };
  if (!ready) {
    if (opts.vod) {
      return { ok: false, error: "HLS packager still warming" };
    }
    stopSession(key);
    return { ok: false, error: "HLS packager timed out" };
  }

  return { ok: false, error: "Invalid HLS playlist" };
}


/** Serve an already-packed playlist immediately (fast zap / VOD resume). */
export function readLocalPackagerPlaylist(streamId: string, lineId = "daemon"): string | null {
  return tryReadReadyPlaylist(lineId, streamId);
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
