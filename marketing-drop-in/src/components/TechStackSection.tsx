import { Server, Radio, Gpu, Globe, Zap } from "lucide-react";

const STACK = [
  {
    icon: Server,
    title: "Web server",
    headline: "Nginx 1.29.0",
    desc: "HTTP/2, HTTP/3, and QUIC for low-latency IPTV delivery. Anti-Freeze proxy with live buffering disabled.",
    accent: "from-sky-500 to-cyan-600",
  },
  {
    icon: Radio,
    title: "Media processing",
    headline: "FFmpeg 8.0 optimized",
    desc: "Highly tuned FFmpeg builds for HLS, MPEG-TS, and adaptive ladders — on-demand or always-on restream.",
    accent: "from-violet-500 to-purple-600",
  },
  {
    icon: Gpu,
    title: "GPU acceleration",
    headline: "NVIDIA CUDA / NVENC",
    desc: "Full NVIDIA CUDA and NVENC support — h264_nvenc, hevc_nvenc, 4K ladders with automatic CPU fallback.",
    accent: "from-emerald-500 to-teal-600",
  },
  {
    icon: Globe,
    title: "GeoIP & network control",
    headline: "GeoIP & network modules",
    desc: "MaxMind GeoLite2, country/ISP routing, VPN and datacenter blocks, geo-aware load balancing.",
    accent: "from-amber-500 to-orange-500",
  },
];

export function TechStackSection() {
  return (
    <section className="border-y border-white/10 bg-[#080612]">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400/90 flex items-center gap-2">
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
              className="glass rounded-2xl p-8 border border-white/5 hover:border-cyan-500/20 transition-colors"
            >
              <div className={`inline-flex rounded-xl p-3 bg-gradient-to-br ${item.accent}`}>
                <item.icon size={22} className="text-white" />
              </div>
              <p className="text-xs uppercase tracking-wider text-white/50 mt-5">{item.title}</p>
              <h3 className="font-display mt-1 text-xl font-semibold text-white">{item.headline}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{item.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
