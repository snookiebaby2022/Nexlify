import type { Metadata } from "next";
import { GrowthLinksPage } from "@/components/growth/GrowthLinksPage";

export const metadata: Metadata = {
  title: "Campaign links",
  description: "UTM-tracked Nexlify campaign URLs for TikTok, Discord, and other channels.",
  robots: { index: false, follow: false },
};

export default function GrowLinksPage() {
  return <GrowthLinksPage />;
}
