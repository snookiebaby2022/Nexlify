import { TikTokDemoWalkthrough } from "@/components/promo/TikTokDemoWalkthrough";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Nexlify Demo Walkthrough — TikTok Screen Recording",
  description:
    "Animated walkthrough of the Nexlify IPTV panel demo for TikTok screen recording. worldwide reseller sandbox preview.",
  path: "/promo/tiktok-demo",
  noIndex: true,
  exactTitle: true,
});

export default function TikTokDemoPromoPage() {
  return <TikTokDemoWalkthrough />;
}
