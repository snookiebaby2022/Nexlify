import type { Metadata } from "next";
import { GrowthOverview } from "@/components/growth/GrowthOverview";

export const metadata: Metadata = {
  title: "Growth toolkit",
  description: "Copy UTM-tracked campaign links to drive visitors and license sales for Nexlify.",
  robots: { index: false, follow: false },
};

export default function GrowPage() {
  return <GrowthOverview />;
}
