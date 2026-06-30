import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { WebPageJsonLd } from "@/components/WebPageJsonLd";
import { LivestreamPlayer } from "@/components/LivestreamPlayer";
import { getLivestreamConfig } from "@/lib/livestream";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/livestream");

export default function LivestreamPage() {
  const { hlsUrl, hls720Url, title } = getLivestreamConfig();
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Live stream", path: "/livestream" },
        ]}
      />
      <WebPageJsonLd
        path="/livestream"
        name="Nexlify live stream"
        description="Watch Nexlify product demos and software updates — not TV channels. Live sessions for worldwide IPTV resellers."
        about="Live stream"
      />
      <LivestreamPlayer hlsUrl={hlsUrl} hls720Url={hls720Url} title={title} />
    </>
  );
}
