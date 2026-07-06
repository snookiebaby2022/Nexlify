import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { Brain, Shield, Radio, Smartphone, Cloud, Wrench, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";

const features = [
  {
    title: "AI Studio — 15 Tools",
    desc: "Voice-to-SQL queries, anomaly detection, bouquet builder, EPG scraper, logo/thumbnail generator, support chat, and more.",
    icon: Brain,
    accent: "from-violet-500 to-fuchsia-500",
    motion: "pulse" as const,
    delay: 0,
    highlight: true,
  },
  {
    title: "Disaster Recovery",
    desc: "One-click backup/restore with AES-256-GCM encryption, cloud upload to S3/xDrive/Dropbox, pg_dump integration, and SHA-256 checksums.",
    icon: ShieldCheck,
    accent: "from-sky-400 to-cyan-500",
    motion: "float" as const,
    delay: 0.3,
    highlight: false,
  },
  {
    title: "Anti-Piracy Security",
    desc: "DDoS shield, stream fingerprinting, invisible watermarking, device binding, same-IP detection, and VPN auto-block.",
    icon: Shield,
    accent: "from-emerald-400 to-teal-500",
    motion: "float" as const,
    delay: 0.4,
    highlight: false,
  },
  {
    title: "100K Concurrent Users",
    desc: "DB indexes, connection caching, N+1 batch fixes, PM2 cluster mode, gzip compression — built for massive scale.",
    icon: Zap,
    accent: "from-amber-400 to-orange-500",
    motion: "wobble" as const,
    delay: 0.5,
    highlight: false,
  },
  {
    title: "WebRTC Streaming",
    desc: "Low-latency WebRTC gateway with MediaMTX integration — sub-second playback on any device.",
    icon: Radio,
    accent: "from-cyan-400 to-blue-500",
    motion: "wobble" as const,
    delay: 0.6,
    highlight: false,
  },
  {
    title: "Universal Devices",
    desc: "M3U, MAG/Stalker portals, Enigma2, Active Code API, branded APK builder, and apps lock per line.",
    icon: Smartphone,
    accent: "from-orange-400 to-amber-500",
    motion: "float-slow" as const,
    delay: 0.7,
    highlight: false,
  },
  {
    title: "xDrive Cloud Backup",
    desc: "Encrypted S3/GCS/Azure backup upload with retention policies — full panel restore in one click.",
    icon: Cloud,
    accent: "from-sky-400 to-cyan-500",
    motion: "float" as const,
    delay: 0.9,
    highlight: false,
  },
  {
    title: "Intelligent Load Balancer",
    desc: "Health, geo, and bandwidth-weighted server selection with DNS rotator and automatic failover.",
    icon: Wrench,
    accent: "from-fuchsia-400 to-violet-500",
    motion: "pulse" as const,
    delay: 1.1,
    highlight: false,
  },
];

export function Features() {
  const heroFeature = features.find((f) => f.highlight);
  const otherFeatures = features.filter((f) => !f.highlight);

  return (
    <section className="relative overflow-hidden border-y border-violet-500/10 bg-[#080714]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(139,92,246,0.06),transparent)]" />

      <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">
            Why Nexlify
          </p>
          <h2 className="font-display mt-3 text-3xl font-bold text-white md:text-4xl">
            Everything operators expect — built in
          </h2>
          <p className="mt-4 text-[var(--muted)]">
            Security, devices, billing, and AI tools in one maintained IPTV management stack.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {heroFeature && (
            <article className="group glass relative overflow-hidden rounded-2xl p-8 transition-all hover:border-violet-500/20 lg:row-span-2">
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/8 blur-3xl" />
              <div className="absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-fuchsia-500/5 blur-3xl" />
              <div className="relative">
                <AnimatedAvatar accent={heroFeature.accent} size="sm" motion={heroFeature.motion} delay={heroFeature.delay}>
                  <heroFeature.icon size={22} className="text-white" />
                </AnimatedAvatar>
                <h3 className="font-display mt-5 text-2xl font-bold text-white">{heroFeature.title}</h3>
                <p className="mt-4 text-base leading-relaxed text-[var(--muted)]">{heroFeature.desc}</p>

                <div className="mt-8 grid grid-cols-2 gap-3">
                  {[
                    "Voice-to-SQL",
                    "Anomaly Detection",
                    "Bouquet Builder",
                    "EPG Scraper",
                    "Logo Generator",
                    "Support Chat",
                    "Health Predictor",
                    "Restream Detector",
                  ].map((tool) => (
                    <div key={tool} className="flex items-center gap-2 text-sm text-slate-300">
                      <span className="h-1 w-1 rounded-full bg-violet-400" />
                      {tool}
                    </div>
                  ))}
                </div>

                <Link
                  href="/features"
                  className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-violet-300 hover:text-violet-200 transition-colors"
                >
                  View all 15 AI tools <ArrowRight size={14} />
                </Link>
              </div>
            </article>
          )}

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
            {otherFeatures.map((f) => (
              <article
                key={f.title}
                className="group glass rounded-2xl p-6 transition-all hover:scale-[1.02] hover:border-violet-500/20"
              >
                <AnimatedAvatar accent={f.accent} size="sm" motion={f.motion} delay={f.delay}>
                  <f.icon size={20} className="text-white" />
                </AnimatedAvatar>
                <h3 className="font-display mt-4 text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{f.desc}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/features"
            className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-6 py-3 text-sm font-medium text-violet-200 transition-all hover:bg-violet-500/15 hover:border-violet-400/30"
          >
            Compare all 100+ features <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
