export function formatBytes(n: bigint | number) {
  const num = typeof n === "bigint" ? Number(n) : n;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / 1024 / 1024).toFixed(1)} MB`;
  return `${(num / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatMbps(bytesPerMinute: number) {
  const bitsPerSec = (bytesPerMinute * 8) / 60;
  const mbps = bitsPerSec / 1_000_000;
  return `${mbps.toFixed(2)} Mbps`;
}
