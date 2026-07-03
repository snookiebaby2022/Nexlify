import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { Brain, Shield, Radio, Smartphone, Cloud, Wrench } from "lucide-react";

const features = [
  {
    title: "AI Studio — 15 Tools",
    desc: "Voice-to-SQL queries, anomaly detection, bouquet builder, EPG scraper, logo/thumbnail generator, support chat, and more.",
    icon: Brain,
    accent: "from-violet-500 to-fuchsia-600",
    motion: "pulse" as const,
    delay: 0,
  },
  {
    title: "Anti-Piracy Security",
    desc: "DDoS shield, stream fingerprinting, invisible watermarking, device binding, same-IP detection, and VPN auto-block.",
    icon: Shield,
    accent: "from-emerald-500 to-teal-600",
    motion: "float" as const,
    delay: 0.3,
  },
  {
    title: "WebRTC Streaming",
    desc: "Low-latency WebRTC gateway with MediaMTX integration — sub-second playback on any device.",
    icon: Radio,
    accent: "from-cyan-500 to-sky-600",
    motion: "wobble" as const,
    delay: 0.5,
  },
  {
    title: "Universal Devices",
    desc: "M3U, MAG/Stalker portals, Enigma2, Active Code API, branded APK builder, and apps lock per line.",
    icon: Smartphone,
    accent: "from-amber-500 to-orange-500",
    motion: "float-slow" as const,
    delay: 0.7,
  },
  {
    title: "xDrive Cloud Backup",
    desc: "Encrypted S3/GCS/Azure backup upload with retention policies — full panel restore in one click.",
    icon: Cloud,
    accent: "from-sky-500 to-cyan-500",
    motion: "float" as const,
    delay: 0.9,
  },
  {
    title: "Intelligent Load Balancer",
    desc: "Health, geo, and bandwidth-weighted server selection with DNS rotator and automatic failover.",
    icon: Wrench,
    accent: "from-fuchsia-500 to-violet-600",
    motion: "pulse" as const,
    delay: 1.1,
  },
];

export function Features() {
  return (
    <section className="border-y border-white/10 bg-[#0a0814]">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-400/90">
            Why Nexlify
          </p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white md:text-4xl">
            Everything operators expect — built in
          </h2>
          <p className="mt-4 text-[var(--muted)]">
            Security, devices, billing, sports, and bouquet tools in one maintained IPTV management stack.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article
              key={f.title}
              className="group glass rounded-2xl p-8 transition-colors hover:border-violet-500/30"
            >
              <AnimatedAvatar accent={f.accent} size="sm" motion={f.motion} delay={f.delay}>
                <f.icon size={22} className="text-white" />
              </AnimatedAvatar>
              <h3 className="font-display mt-5 text-xl font-semibold text-white">{f.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{f.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
