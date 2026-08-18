import path from "path";

const HLS_ROOT = process.env.HLS_DISK_ROOT || "/var/lib/nexlify/hls";

export const hlsDiskRoot = HLS_ROOT;

export function hlsStreamDir(streamId: string): string {
  return path.join(HLS_ROOT, streamId);
}

export function hlsIndexPath(streamId: string): string {
  return path.join(hlsStreamDir(streamId), "index.m3u8");
}

export function localHlsIndexPath(streamId: string): string {
  return hlsIndexPath(streamId);
}
