import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nexlify WebPlayer - Stream Live TV, Movies & Series",
  description: "Stream live TV, movies & series anywhere — your entertainment, your way. Free web player for IPTV playlists.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function WebPlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {children}
    </div>
  );
}
