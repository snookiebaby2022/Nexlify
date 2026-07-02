import { NexlifyMetaAd } from "@/components/promo/NexlifyMetaAd";
import { pageMetadata } from "@/lib/seo";
import { withCoreKeywords } from "@/lib/seo-keywords";

export const metadata = pageMetadata({
  title: "Nexlify Meta Ad — IPTV Reseller Panel Creative",
  description:
    "Meta ad creative for Nexlify IPTV reseller panel — IPTV management software with WHMCS IPTV module. Export-ready landscape layout.",
  path: "/promo/meta-ad",
  keywords: withCoreKeywords(["Meta ad creative"]),
  noIndex: true,
  exactTitle: true,
});

export default function MetaAdPage() {
  return <NexlifyMetaAd />;
}
