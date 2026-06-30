export function agentPidFile(serverId: string, streamId: string) {
  return `/var/run/nexlify/stream-${serverId}-${streamId}.pid`;
}

export function buildFfmpegStartCmd(opts: {
  ffmpegPath: string;
  inputUrl: string;
  streamId: string;
  serverId: string;
  preset?: string;
  threads?: number;
  customCmd?: string | null;
  transcodeArgs?: string[];
}): string {
  if (opts.customCmd?.trim()) return opts.customCmd.trim();

  const pidFile = agentPidFile(opts.serverId, opts.streamId);
  const threads =
    opts.threads && opts.threads > 0 ? ["-threads", String(opts.threads)] : [];
  const preset = opts.preset && opts.preset !== "none" ? ["-preset", opts.preset] : [];

  const transcodeBody = opts.transcodeArgs?.length
    ? opts.transcodeArgs.map((a, i, arr) => (i > 0 && arr[i - 1] === "-i" ? shellQuote(a) : a))
    : ["-i", shellQuote(opts.inputUrl), "-c", "copy", "-f", "mpegts"];

  const args = [
    opts.ffmpegPath,
    "-hide_banner",
    "-loglevel",
    "warning",
    "-re",
    ...transcodeBody,
    "pipe:1",
    ...preset,
    ...threads,
  ];

  return `nohup ${args.join(" ")} > /var/log/nexlify/stream-${opts.streamId}.log 2>&1 & echo $! > ${shellQuote(pidFile)}`;
}

export function buildFfmpegStopCmd(serverId: string, streamId: string): string {
  const pidFile = agentPidFile(serverId, streamId);
  return `if [ -f ${shellQuote(pidFile)} ]; then kill $(cat ${shellQuote(pidFile)}) 2>/dev/null; rm -f ${shellQuote(pidFile)}; fi`;
}

function shellQuote(s: string) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function parsePidFromAgent(meta: { pid?: number | null }) {
  return meta.pid != null && meta.pid > 0 ? meta.pid : null;
}
