import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { Shield, Smartphone, Mail, Coins, Trophy, Layers } from "lucide-react";

const features = [
  {
    title: "AI Copilot Security",
    desc: "Analytics + AI insights continuously monitor logs for fraud, suspicious IP jumps, and compromised reseller accounts.",
    icon: Shield,
    accent: "from-emerald-500 to-teal-600",
    motion: "pulse" as const,
    delay: 0,
  },
  {
    title: "Universal Devices",
    desc: "M3U playlists, MAG/Stalker portals, Enigma2 devices, and secure Active Code API for mobile apps.",
    icon: Smartphone,
    accent: "from-cyan-500 to-sky-600",
    motion: "float" as const,
    delay: 0.3,
  },
  {
    title: "Automated Client Emails",
    desc: "HTML welcome summaries with M3U and portal links when lines are created — no copy-paste credentials.",
    icon: Mail,
    accent: "from-violet-500 to-fuchsia-600",
    motion: "wobble" as const,
    delay: 0.5,
  },
  {
    title: "Advanced Billing Logs",
    desc: "Complete financial audit trail — track every credit added, deducted, or refunded with immutable logs.",
    icon: Coins,
    accent: "from-amber-500 to-orange-500",
    motion: "float-slow" as const,
    delay: 0.7,
  },
  {
    title: "Live Sports Integration",
    desc: "API-Sports fixtures on the reseller dashboard — UFC, NBA, Premier League, and more at a glance.",
    icon: Trophy,
    accent: "from-sky-500 to-cyan-500",
    motion: "float" as const,
    delay: 0.9,
  },
  {
    title: "Bouquet Templates",
    desc: "Unlimited package templates — load complex country and VOD bouquet selections in one click.",
    icon: Layers,
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
