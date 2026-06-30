import { LpCtaPage } from "@/components/LpCtaPage";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/lp/live-tv-streaming-platform");

export default function LiveTvStreamingPlatformPage() {
  return (
    <LpCtaPage
      path="/lp/live-tv-streaming-platform"
      breadcrumbLabel="Live TV streaming platform"
      h1="Run a live TV streaming service your subscribers love"
      sub="Nexlify is management software for operators building premium digital entertainment businesses — HD streaming player app compatibility, smooth live sports playback, and cut-the-cord-ready infrastructure on your own VPS. Software only; you supply content and billing."
      bullets={[
        "Built for live TV streaming service operators worldwide",
        "Anti-Freeze + fast zapping — better watch live sports online experience",
        "Xtream-compatible HD streaming player app URLs",
        "Premium digital entertainment branding & white-label",
        "Cut the cord streaming stack — modern Node + PostgreSQL",
        "7-day free trial · No card required",
      ]}
      primaryHref="/register?trial=1&utm_source=ads&utm_medium=lp&utm_campaign=live_tv_streaming"
      primaryLabel="Start 7-Day Free Trial – No Card Required"
      primaryTrack="trial_start"
      badge="Operator software · No content hosted by Nexlify"
    />
  );
}
