import Link from "next/link";

type PluginPricingSectionProps = {
  whmcsCartBaseUrl: string | null;
};

const ADDONS = [
  { name: "Media pack", desc: "Plex, Emby, Jellyfin, YouTube integrations", gbp: 25 },
  { name: "Music pack", desc: "Spotify, Apple Music, Deezer, YouTube Music", gbp: 20 },
  { name: "Full plugin bundle", desc: "All media + music plugins with priority updates", gbp: 40 },
] as const;

export function PluginPricingSection({ whmcsCartBaseUrl }: PluginPricingSectionProps) {
  return (
    <section className="border-t border-white/10 bg-[#0a0814] py-16 md:py-20">
      <div className="mx-auto max-w-4xl px-4 text-center">
        <h2 className="font-display text-2xl font-bold text-white">Plugin add-ons</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--muted)]">
          Optional WHMCS addon products — unlock media and music integrations on any paid tier.
        </p>
        <div className="mt-10 grid gap-4 text-left md:grid-cols-3">
          {ADDONS.map((addon) => (
            <div key={addon.name} className="glass rounded-2xl p-5">
              <h3 className="font-semibold text-violet-200">{addon.name}</h3>
              <p className="mt-2 text-xs text-[var(--muted)]">{addon.desc}</p>
              <p className="mt-4 font-display text-lg font-bold text-white">£{addon.gbp}/mo</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-[var(--muted)]">
          Configure product IDs in{" "}
          <Link href="/docs/whmcs" className="text-violet-400 hover:text-violet-300 underline">
            WHMCS module docs
          </Link>
          {whmcsCartBaseUrl ? " · checkout via your WHMCS cart" : ""}.
        </p>
      </div>
    </section>
  );
}
