export function agentPidFile(serverId: string, streamId: string) {
  return `/var/run/nexlify/stream-${serverId}-${streamId}.pid`;
}

export function agentLogFile(streamId: string) {
  return `/var/log/nexlify/stream-${streamId}.log`;
}

export type FfmpegArgvSpec = {
  ffmpegPath: string;
  args: string[];
  pidFile: string;
  logFile: string;
};

function isAbsoluteBin(path: string): boolean {
  return path.startsWith("/") && !path.includes("\0") && !path.includes("..");
}

/** Structured ffmpeg argv for the stream agent (no shell). Ignores custom shell commands. */
export function buildFfmpegArgv(opts: {
  ffmpegPath: string;
  inputUrl: string;
  streamId: string;
  serverId: string;
  preset?: string;
  threads?: number;
  transcodeArgs?: string[];
}): FfmpegArgvSpec {
  const ffmpegPath = isAbsoluteBin(opts.ffmpegPath) ? opts.ffmpegPath : "/usr/bin/ffmpeg";
  const threads =
    opts.threads && opts.threads > 0 ? ["-threads", String(Math.min(64, Math.floor(opts.threads)))] : [];
  const preset =
    opts.preset && opts.preset !== "none" && /^[A-Za-z0-9_-]+$/.test(opts.preset)
      ? ["-preset", opts.preset]
      : [];

  const transcodeBody =
    opts.transcodeArgs && opts.transcodeArgs.length > 0
      ? opts.transcodeArgs.filter((a) => typeof a === "string")
      : ["-i", opts.inputUrl, "-c", "copy", "-f", "mpegts"];

  const args = ["-hide_banner", "-loglevel", "warning", "-re", ...transcodeBody, "pipe:1", ...preset, ...threads];
  return {
    ffmpegPath,
    args,
    pidFile: agentPidFile(opts.serverId, opts.streamId),
    logFile: agentLogFile(opts.streamId),
  };
}

function shellQuote(s: string) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Shell one-liner for old agents only. Built from argv so URLs are quoted. */
export function buildFfmpegStartCmd(spec: FfmpegArgvSpec): string {
  const quoted = spec.args.map(shellQuote).join(" ");
  return `nohup ${shellQuote(spec.ffmpegPath)} ${quoted} > ${shellQuote(spec.logFile)} 2>&1 & echo $! > ${shellQuote(spec.pidFile)}`;
}

export function buildFfmpegStopCmd(serverId: string, streamId: string): string {
  const pidFile = agentPidFile(serverId, streamId);
  return `if [ -f ${shellQuote(pidFile)} ]; then kill $(cat ${shellQuote(pidFile)}) 2>/dev/null; rm -f ${shellQuote(pidFile)}; fi`;
}

export function parsePidFromAgent(meta: { pid?: number | null }) {
  return meta.pid != null && meta.pid > 0 ? meta.pid : null;
}
