"use client";

import Link from "next/link";
import { FFMPEG_TRANSCODE_PROFILES } from "@/lib/ffmpeg-transcode-profiles";
import { GPU_TRANSCODE_LADDER } from "@/lib/gpu-transcode";

export default function TranscodingHubPage() {
  return (
    <div className="space-y-5 max-w-5xl">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <div>
          <p className="text-xs text-white/80">Deep controls</p>
          <h1 className="text-lg font-semibold text-white">Transcoding Studio</h1>
        </div>
        <Link href="/admin/settings/streams" className="text-sm px-3 py-1.5 rounded border border-white/70 text-white hover:bg-white/10">
          Global stream settings
        </Link>
      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        XUI-style transcoding with <strong>FFmpeg 8.0</strong> and full <strong>NVIDIA CUDA / NVENC</strong> GPU ladders.
        CPU profiles below; enable Transcoding Pro Pack for h264_nvenc / hevc_nvenc on stream servers.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h2 className="font-semibold text-sm">CPU / software profiles</h2>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Used when GPU pack is off or as fallback. Set default under Settings → Streams.</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="py-1 text-left">Profile</th>
                <th className="py-1 text-left">Resolution</th>
                <th className="py-1 text-right">Video</th>
              </tr>
            </thead>
            <tbody>
              {FFMPEG_TRANSCODE_PROFILES.map((p) => (
                <tr key={p.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 font-medium">{p.label}</td>
                  <td className="py-1.5">{p.resolution}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.videoBitrateKbps ? `${p.videoBitrateKbps}k` : "copy"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h2 className="font-semibold text-sm">GPU adaptive ladder</h2>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Transcoding Pro Pack — multi-bitrate HLS from dedicated stream servers.</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="py-1 text-left">Profile</th>
                <th className="py-1 text-left">Encoder</th>
                <th className="py-1 text-right">Bitrate</th>
              </tr>
            </thead>
            <tbody>
              {GPU_TRANSCODE_LADDER.map((p) => (
                <tr key={p.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 font-medium">{p.label}</td>
                  <td className="py-1.5 uppercase">{p.gpuEncoder}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.videoBitrateKbps}k</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href="/admin/settings/transcoding-pack" className="text-xs underline" style={{ color: "var(--accent)" }}>Configure GPU pack →</Link>
        </div>
      </div>

      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}>
        <h2 className="font-semibold text-sm mb-2">Inputs & restreaming</h2>
        <ul className="text-sm space-y-1 list-disc pl-5" style={{ color: "var(--muted)" }}>
          <li><strong>HTTP/HLS input</strong> — primary <code className="text-xs">streamUrl</code> (.m3u8 preferred)</li>
          <li><strong>Backup source</strong> — automatic failover when health probe fails</li>
          <li><strong>RTMP publish</strong> — ingest on stream server, relay via nginx-rtmp → HLS out</li>
          <li><strong>On-demand ffmpeg</strong> — starts on viewer connect (saves CPU on idle channels)</li>
          <li><strong>Always-on restream</strong> — panel agent keeps ffmpeg/nginx relay running</li>
          <li><strong>Multi-server</strong> — assign per stream or let LB pick edge node</li>
        </ul>
        <div className="flex flex-wrap gap-2 mt-3">
          <Link href="/admin/management/tools/bulk-backup-urls" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Bulk backup URLs</Link>
          <Link href="/admin/management/rtmp-ips" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>RTMP IPs</Link>
          <Link href="/admin/servers/nginx-config" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>nginx HLS template</Link>
        </div>
      </div>

      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}>
        <h2 className="font-semibold text-sm mb-2">Per-stream controls (Add / Edit Stream)</h2>
        <ul className="text-sm space-y-1 list-disc pl-5" style={{ color: "var(--muted)" }}>
          <li><strong>Direct source</strong> — movies &amp; series only (return upstream URL to the client)</li>
          <li><strong>Live relay</strong> — HTTP(S) live channels proxy through <code>/live/…</code> (no always-on ffmpeg)</li>
          <li><strong>On demand</strong> — start ffmpeg when a viewer connects</li>
          <li><strong>Transcode profile</strong> — 1080p / 720p / copy / GPU ladder</li>
          <li><strong>Custom FFmpeg map</strong> — full command override in agent metadata</li>
          <li><strong>ABR bitrates</strong> — multi-variant ladder on one channel</li>
          <li><strong>On-demand probesize</strong> — faster startup for VOD-style live</li>
        </ul>
        <div className="flex flex-wrap gap-2 mt-3">
          <Link href="/admin/streams/add" className="text-xs px-3 py-1.5 rounded btn-positive">Add stream</Link>
          <Link href="/admin/content/streams" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Manage streams</Link>
          <Link href="/admin/process_monitor" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Process monitor</Link>
        </div>
      </div>
    </div>
  );
}
