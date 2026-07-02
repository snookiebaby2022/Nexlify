import { LpCtaPage } from "@/components/LpCtaPage";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/lp/cut-the-cord-streaming");

export default function CutTheCordStreamingPage() {
  return (
    <LpCtaPage
      path="/lp/cut-the-cord-streaming"
      breadcrumbLabel="Cut the cord streaming platform"
      h1="Cut the cord streaming — platform software for modern operators"
      sub="Launch or upgrade a premium digital entertainment business with Nexlify: live TV streaming service tools, WHMCS billing, and an HD streaming player app-compatible stack subscribers expect when they cut traditional cable."
      bullets={[
        "Cut the cord streaming infrastructure on your VPS",
        "Live TV streaming service management in one dashboard",
        "Help subscribers watch live sports online with Anti-Freeze",
        "HD streaming player app & STB compatibility",
        "GBP/USD checkout · 7-day trial",
        "Software only — compliant operator positioning",
      ]}
      primaryHref="/register?trial=1&utm_source=ads&utm_medium=lp&utm_campaign=cut_the_cord"
      primaryLabel="Start 7-Day Free Trial – No Card Required"
      primaryTrack="trial_start"
      badge="Management software for licensed operators"
    />
  );
}
