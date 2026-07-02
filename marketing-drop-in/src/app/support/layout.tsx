import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Support Ticket — Nexlify",
  description: "View and reply to your Nexlify IPTV panel support ticket.",
  path: "/support",
  noIndex: true,
  exactTitle: true,
});

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
