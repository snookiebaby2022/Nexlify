import { AnimatedAvatar } from "@/components/AnimatedAvatar";

const features = [
  {
    title: "Research & UX",
    desc: "Polished back-office and reseller flows designed for operators who run at scale — without the clutter.",
    icon: "◆",
    accent: "from-violet-500 to-fuchsia-600",
    motion: "float" as const,
    delay: 0,
  },
  {
    title: "Security first",
    desc: "Encrypted license validation, server binding, and instant revoke when WHMCS suspends or terminates.",
    icon: "◇",
    accent: "from-cyan-500 to-sky-600",
    motion: "wobble" as const,
    delay: 0.5,
  },
  {
    title: "WHMCS automation",
    desc: "Create, renew, suspend, and terminate services — each event syncs panel license state in real time.",
    icon: "○",
    accent: "from-amber-500 to-orange-500",
    motion: "float-slow" as const,
    delay: 1,
  },
  {
    title: "Your panel, your stack",
    desc: "You already run the full IPTV UI. We only handle commerce and keys — plug in via one API call.",
    icon: "▣",
    accent: "from-emerald-500 to-teal-600",
    motion: "pulse" as const,
    delay: 0.3,
  },
  {
    title: "Anti-Freeze & fast zapping",
    desc: "Low-latency /live redirects, no live nginx buffering, Redis URL cache, and neighbour-channel prefetch for instant channel changes.",
    icon: "⚡",
    accent: "from-sky-500 to-cyan-500",
    motion: "float" as const,
    delay: 0.7,
  },
  {
    title: "Video management",
    desc: "Dedicated VOD workspace at Content → Video — probe streams, import M3U playlists, and manage on-demand sources separately from live channels.",
    icon: "▶",
    accent: "from-fuchsia-500 to-violet-600",
    motion: "pulse" as const,
    delay: 0.9,
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
            Built for operators — not lookalikes
          </h2>
          <p className="mt-4 text-[var(--muted)]">
            Inspired by industry-leading panel software, with a distinct identity and WHMCS-native billing.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article
              key={f.title}
              className="group glass rounded-2xl p-8 transition-colors hover:border-violet-500/30"
            >
              <AnimatedAvatar accent={f.accent} size="sm" motion={f.motion} delay={f.delay}>
                {f.icon}
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
