import { TikTokSellAd } from "@/components/promo/TikTokSellAd";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Nexlify TikTok Promo — IPTV Panel Ad Creative",
  description:
    "Full-screen Nexlify IPTV panel selling promo for TikTok screen recording. worldwide reseller panel with WHMCS billing and live demo.",
  path: "/promo/tiktok",
  noIndex: true,
  exactTitle: true,
});

export default function TikTokPromoPage() {
  return <TikTokSellAd />;
}
