"use client";

import Link from "next/link";

const features = [
  { icon: "🩺", title: "Health Predictor", desc: "Predict stream failures before they happen with AI-powered risk analysis.", href: "/admin/ai/health-predictor" },
  { icon: "📡", title: "EPG Scraper", desc: "Auto-suggest categories and names for EPG sources using AI.", href: "/admin/ai/epg-scraper" },
  { icon: "📊", title: "Viewer Analytics", desc: "Deep insights into viewer behavior, churn risk, and binge patterns.", href: "/admin/ai/viewer-analytics" },
  { icon: "🎁", title: "Bouquet Builder", desc: "Generate optimized channel packages from natural language descriptions.", href: "/admin/ai/bouquet-builder" },
  { icon: "💬", title: "Natural Language", desc: "Control your panel using plain English commands.", href: "/admin/ai/natural-language" },
  { icon: "🎬", title: "Transcode Recommender", desc: "AI recommends optimal encoding settings per stream.", href: "/admin/ai/transcode-recommender" },
  { icon: "⚠️", title: "Anomaly Detector", desc: "Spot unusual patterns in connections, bandwidth, and usage.", href: "/admin/ai/anomaly-detector" },
  { icon: "🎧", title: "Support Chat", desc: "AI-powered customer support assistant for your users.", href: "/admin/ai/support-chat" },
  { icon: "🔄", title: "Restream Detector", desc: "Identify restreamed content across your network.", href: "/admin/ai/restream-detector" },
  { icon: "🧾", title: "Invoice Generator", desc: "Auto-generate professional invoices for resellers.", href: "/admin/ai/invoice-generator" },
  { icon: "🎙️", title: "Voice Query", desc: "Query your panel data using voice commands.", href: "/admin/ai/voice-query" },
  { icon: "🎨", title: "Logo Generator", desc: "Generate logos and branding assets for bouquets.", href: "/admin/ai/logo-generator" },
  { icon: "📅", title: "Seasonal Recommender", desc: "Suggest seasonal content rotations and promotions.", href: "/admin/ai/seasonal-recommender" },
  { icon: "🖼️", title: "Thumbnail Generator", desc: "Auto-generate thumbnails for VOD and series content.", href: "/admin/ai/thumbnail-generator" },
];

export default function AIHubPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">AI Hub</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          14 AI-powered features to automate and optimize your panel.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f) => (
          <Link key={f.href} href={f.href}>
            <div
              className="rounded-lg border p-5 hover:opacity-80 transition-opacity cursor-pointer h-full"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h2 className="text-lg font-semibold mb-1">{f.title}</h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>{f.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
