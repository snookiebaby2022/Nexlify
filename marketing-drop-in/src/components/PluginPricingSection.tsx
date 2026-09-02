import Link from "next/link";
import { pluginPricingBlurb } from "@/lib/marketing-copy";

const ADDONS = [
  { name: "Media pack", desc: "Plex, Emby, Jellyfin, YouTube integrations" },
  { name: "Music pack", desc: "Spotify, Apple Music, Deezer, YouTube Music" },
  { name: "Full plugin bundle", desc: "All media + music plugins with priority updates" },
] as const;

export function PluginPricingSection() {
  return (
    <section className="border-t border-white/10 bg-[#0a0814] py-16 md:py-20" id="plugins">
      <div className="mx-auto max-w-4xl px-4 text-center">
        <h2 className="font-display text-2xl font-bold text-white">Plugins included free</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--muted)]">
          Every media and music integration is included with your Nexlify License at no extra cost —
          {pluginPricingBlurb()}.
        </p>
        <div className="mt-10 grid gap-4 text-left md:grid-cols-3">
          {ADDONS.map((addon) => (
            <div key={addon.name} className="glass rounded-2xl p-5">
              <h3 className="font-semibold text-violet-200">{addon.name}</h3>
              <p className="mt-2 text-xs text-[var(--muted)]">{addon.desc}</p>
              <p className="mt-4 font-display text-lg font-bold text-emerald-400">Free</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Included with license</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-[var(--muted)]">
          See setup in{" "}
          <Link href="/help" className="text-violet-400 hover:text-violet-300 underline">
            help docs
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
