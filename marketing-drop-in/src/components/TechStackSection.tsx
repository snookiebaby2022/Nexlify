import { Server, Radio, Gpu, Globe, Zap } from "lucide-react";

const STACK = [
  {
    icon: Server,
    title: "Web server",
    headline: "Nginx 1.29.0",
    desc: "HTTP/2, HTTP/3, and QUIC for low-latency IPTV delivery. Anti-Freeze proxy with live buffering disabled.",
    accent: "from-sky-400 to-cyan-500",
  },
  {
    icon: Radio,
    title: "Media processing",
    headline: "FFmpeg 8.0 optimized",
    desc: "Highly tuned FFmpeg builds for HLS, MPEG-TS, and adaptive ladders — on-demand or always-on restream.",
    accent: "from-violet-400 to-purple-500",
  },
  {
    icon: Gpu,
    title: "GPU acceleration",
    headline: "NVIDIA CUDA / NVENC",
    desc: "Full NVIDIA CUDA and NVENC support — h264_nvenc, hevc_nvenc, 4K ladders with automatic CPU fallback.",
    accent: "from-emerald-400 to-teal-500",
  },
  {
    icon: Globe,
    title: "GeoIP & network control",
    headline: "GeoIP & network modules",
    desc: "MaxMind GeoLite2, country/ISP routing, VPN and datacenter blocks, geo-aware load balancing.",
    accent: "from-orange-400 to-amber-500",
  },
];

export function TechStackSection() {
  return (
    <section className="relative overflow-hidden border-y border-violet-500/10 bg-[#080714]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(6,182,212,0.04),transparent)]" />

      <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400 flex items-center gap-2">
            <Zap size={16} /> Streaming stack
          </p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white md:text-4xl">
            Built for operators who need speed and control
          </h2>
          <p className="mt-4 text-[var(--muted)]">
            Nginx 1.29, FFmpeg 8, NVIDIA NVENC, and GeoIP modules — not bolted-on plugins.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {STACK.map((item) => (
            <article
              key={item.title}
              className="glass rounded-2xl p-8 border border-violet-500/5 hover:border-cyan-500/15 transition-all hover:scale-[1.01]"
            >
              <div className={`inline-flex rounded-xl p-3 bg-gradient-to-br ${item.accent}`}>
                <item.icon size={22} className="text-white" />
              </div>
              <p className="text-xs uppercase tracking-wider text-white/40 mt-5">{item.title}</p>
              <h3 className="font-display mt-1 text-xl font-semibold text-white">{item.headline}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{item.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
