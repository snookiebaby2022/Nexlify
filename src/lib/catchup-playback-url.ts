/** Shared catch-up / timeshift URL helpers (Xtream + MAG/Stalker). */

export function streamHasArchive(s: {
  vodMode?: string | null;
  archiveDays?: number | null;
  timeshiftSeconds?: number | null;
  isShifted?: boolean | null;
}): boolean {
  return (
    s.vodMode === "CATCHUP" ||
    s.isShifted === true ||
    (s.archiveDays ?? 0) > 0 ||
    (s.timeshiftSeconds ?? 0) > 0
  );
}

export function formatXtreamTimeshiftStart(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d}:${h}-${mi}`;
}

export function panelTimeshiftUrl(
  baseUrl: string,
  username: string,
  password: string,
  streamId: string,
  startUnix: number,
  durationSec: number,
  ext = "ts"
): string {
  const base = baseUrl.replace(/\/+$/, "");
  const start = formatXtreamTimeshiftStart(new Date(startUnix * 1000));
  const durationMin = Math.max(1, Math.ceil(durationSec / 60));
  const u = encodeURIComponent(username);
  const p = encodeURIComponent(password);
  const cleanId = streamId.replace(/\.(ts|m3u8)$/i, "");
  return `${base}/timeshift/${u}/${p}/${durationMin}/${start}/${cleanId}.${ext}`;
}

export type StalkerArchiveRequest = {
  streamId: string;
  startUnix: number;
  durationSec: number;
};

/** Ministra / XUI archive cmd formats for create_link. */
export function parseStalkerArchiveCmd(cmd: string): StalkerArchiveRequest | null {
  const raw = cmd.trim();
  if (!raw) return null;

  let m = raw.match(/(?:auto\s+)?\/media\/file_([^_]+)_(\d{10,13})_(\d+)\.mpg/i);
  if (m) {
    const startRaw = Number(m[2]);
    const dur = Number(m[3]);
    if (Number.isFinite(startRaw) && Number.isFinite(dur) && dur > 0) {
      const startUnix = startRaw > 1e12 ? Math.floor(startRaw / 1000) : startRaw;
      return { streamId: m[1], startUnix, durationSec: dur };
    }
  }

  m = raw.match(/^ffmpeg\s+(\S+)\s+offset\s+(\d+)(?:\s+duration\s+(\d+))?/i);
  if (m) {
    const offset = Number(m[2]);
    const dur = m[3] ? Number(m[3]) : 3600;
    if (Number.isFinite(offset) && Number.isFinite(dur)) {
      return {
        streamId: m[1],
        startUnix: Math.floor(Date.now() / 1000) - offset,
        durationSec: Math.max(60, dur),
      };
    }
  }

  m = raw.match(/(\d{10,13})[_-](\d{2,5})/);
  if (m && /archive|timeshift|file_/i.test(raw)) {
    const startRaw = Number(m[1]);
    const dur = Number(m[2]);
    const idMatch = raw.match(/file_([^_]+)_/i) ?? raw.match(/ffmpeg\s+(\S+)/i);
    if (idMatch && Number.isFinite(startRaw) && Number.isFinite(dur)) {
      return {
        streamId: idMatch[1],
        startUnix: startRaw > 1e12 ? Math.floor(startRaw / 1000) : startRaw,
        durationSec: dur,
      };
    }
  }

  return null;
}

/** EPG row cmd MAG sends back to create_link. */
export function stalkerArchiveEpgCmd(streamId: string, startUnix: number, durationSec: number): string {
  return `auto /media/file_${streamId}_${startUnix}_${durationSec}.mpg`;
}

export function archiveRetentionDays(stream: {
  archiveDays?: number | null;
  timeshiftSeconds?: number | null;
}): number {
  const fromArchive = stream.archiveDays ?? 0;
  const fromShift = stream.timeshiftSeconds ? Math.ceil(stream.timeshiftSeconds / 86400) : 0;
  return Math.max(fromArchive, fromShift, 7);
}
