import { Sparkles, Brain, Shield, Radio, Cloud, Swords, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";

const HIGHLIGHTS = [
  {
    icon: Brain,
    title: "AI Studio — 15 Tools",
    desc: "Voice-to-SQL, anomaly detection, bouquet builder, logo generator, and 11 more AI-powered tools.",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/15",
  },
  {
    icon: Shield,
    title: "Anti-Piracy Security",
    desc: "DDoS shield, stream fingerprinting, device binding, same-IP detection, and VPN auto-block.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/15",
  },
  {
    icon: ShieldCheck,
    title: "Disaster Recovery",
    desc: "One-click backup/restore with AES-256-GCM encryption, cloud upload to S3/xDrive/Dropbox, and pg_dump integration.",
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/15",
  },
  {
    icon: Zap,
    title: "100K Performance",
    desc: "DB indexes, connection caching, N+1 batch fixes, PM2 cluster mode, and gzip compression for massive scale.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/15",
  },
  {
    icon: Swords,
    title: "Bug Fixes & Polish",
    desc: "Category cascade delete, VOD types, stream filters, content moderation persistence, and inline category editing.",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/15",
  },
];

export function WhatsNewSection() {
  return (
    <section className="relative overflow-hidden border-y border-violet-500/10 bg-gradient-to-b from-[#0a0818] via-[#080714] to-[#080714]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.06),transparent)]" />

      <div className="relative mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 p-2">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
              What&apos;s new
            </p>
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
              New in v1.9.2
            </h2>
          </div>
        </div>

        <p className="mt-4 max-w-2xl text-[var(--muted)]">
          Major release with disaster recovery, performance for 100K+ concurrent users, and critical bug fixes across categories, backups, and content management.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HIGHLIGHTS.map((h) => (
            <div
              key={h.title}
              className={`group glass rounded-xl p-5 transition-all hover:scale-[1.02] ${h.border}`}
            >
              <div className={`inline-flex rounded-lg p-2 ${h.bg}`}>
                <h.icon size={18} className={h.color} />
              </div>
              <h3 className="font-display mt-3 text-base font-semibold text-white">{h.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{h.desc}</p>
            </div>
          ))}

          <Link
            href="/updates"
            className="glass flex items-center justify-center rounded-xl p-5 text-sm font-medium text-violet-300 transition-all hover:scale-[1.02] hover:text-violet-200 hover:border-violet-500/20"
          >
            View all release notes →
          </Link>
        </div>
      </div>
    </section>
  );
}
