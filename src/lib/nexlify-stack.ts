/** Canonical Nexlify streaming stack — shown in dashboard, install docs, and marketing. */
export const NEXLIFY_STACK = {
  nginx: {
    version: "1.29.0",
    label: "Nginx 1.29.0",
    features: ["HTTP/2", "HTTP/3", "QUIC", "Anti-Freeze proxy", "HLS edge"],
    installPath: "/home/nexlify/bin/nginx/1.29.0/sbin/nginx",
  },
  ffmpeg: {
    version: "8.0",
    label: "FFmpeg 8.0",
    features: ["Highly optimized builds", "HLS/DASH output", "On-demand & always-on transcode"],
    cudaPath: "/home/nexlify/bin/ffmpeg_bin/8.0_cuda/ffmpeg",
    nvencPath: "/home/nexlify/bin/ffmpeg_bin/8.0_nvenc/ffmpeg",
    defaultPath: "/home/nexlify/bin/ffmpeg_bin/8.0/ffmpeg",
  },
  gpu: {
    label: "NVIDIA CUDA / NVENC",
    features: ["h264_nvenc", "hevc_nvenc", "4K ladder", "Auto CPU fallback"],
    detectCmd: "nvidia-smi",
  },
  geo: {
    label: "GeoIP & network control",
    features: ["MaxMind GeoLite2", "Country/ISP rules", "VPN/datacenter block", "Geo load balancing"],
    defaultDbPath: "/home/nexlify/bin/maxmind/GeoLite2-City.mmdb",
  },
} as const;

export type StackComponentStatus = {
  id: string;
  label: string;
  version?: string;
  ok: boolean;
  detail: string;
  href?: string;
};
