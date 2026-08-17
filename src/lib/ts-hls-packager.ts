import { spawn, type ChildProcess } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { binExists, getFfmpegPath } from "@/lib/bin-tools";

const HLS_TIME_SEC = 4;
const HLS_LIST_SIZE = 10;
const READY_TIMEOUT_MS = 10_000;
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
    const name = line.trim().split(/[\\/]/).pop() ?? "";
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
  const safe = String(streamId).replace(/[^a-zA-Z0-9_-]/g, "");
  return join(tmpdir(), "nexlify-hls", safe);
}

type PackagerSession = {
  key: string;
  dir: string;
  proc: ChildProcess;
  lastAccess: number;
  ready: Promise<boolean>;
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

function stopSession(key: string) {
  const session = sessions.get(key);
  if (!session) return;
  sessions.delete(key);
  try {
    session.proc.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  try {
    rmSync(session.dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function waitForPlaylist(dir: string, proc: ChildProcess, timeoutMs: number): Promise<boolean> {
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
          if (body.includes("#EXTINF") && segs.length >= 1) {
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

async function spawnPackager(
  key: string,
  dir: string,
  upstreamUrl: string,
  _userAgent?: string
): Promise<PackagerSession | null> {
  const ffmpegPath = await getFfmpegPath();
  if (!(await binExists(ffmpegPath))) return null;

  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  mkdirSync(dir, { recursive: true });

  const ua = "VLC/3.0.20 LibVLC/3.0.20";

  const proc = spawn(
    ffmpegPath,
    [
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
      "30000000",
      "-probesize",
      "1000000",
      "-analyzeduration",
      "1000000",
      "-fflags",
      "+genpts+discardcorrupt",
      "-i",
      upstreamUrl,
      "-c",
      "copy",
      "-f",
      "hls",
      "-hls_time",
      String(HLS_TIME_SEC),
      "-hls_init_time",
      "1",
      "-hls_list_size",
      String(HLS_LIST_SIZE),
      "-hls_allow_cache",
      "0",
      "-hls_flags",
      "delete_segments+append_list+omit_endlist",
      "-hls_segment_filename",
      join(dir, "seg%d.ts"),
      join(dir, "index.m3u8"),
    ],
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true }
  );

  proc.on("exit", () => {
    if (sessions.get(key)?.proc === proc) sessions.delete(key);
  });

  const session: PackagerSession = {
    key,
    dir,
    proc,
    lastAccess: Date.now(),
    ready: waitForPlaylist(dir, proc, READY_TIMEOUT_MS),
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
}): Promise<{ ok: true; playlist: string } | { ok: false; error: string }> {
  const key = sessionKey(opts.lineId, opts.streamId);
  const dir = packagerDir(opts.lineId, opts.streamId);
  let session = sessions.get(key);

  if (session && session.proc.exitCode != null) {
    stopSession(key);
    session = undefined;
  }

  if (!session) {
    const created = await spawnPackager(key, dir, opts.upstreamUrl, opts.userAgent);
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
