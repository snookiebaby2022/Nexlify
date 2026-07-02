"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/ai/health-predictor")
      .then((r) => {
        if (r.status === 503) setAiConfigured(false);
        else setAiConfigured(true);
      })
      .catch(() => setAiConfigured(true));
  }, []);

  if (aiConfigured === false) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold">AI Studio Setup</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            AI features require an OpenAI API key to work.
          </p>
        </div>

        <div className="rounded-lg border p-6 space-y-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-lg font-semibold">How to enable AI Studio</h2>

          <div className="space-y-3 text-sm" style={{ color: "var(--muted)" }}>
            <p><strong className="text-white">Step 1:</strong> Get an API key from OpenAI</p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--accent)" }}>platform.openai.com/api-keys</a></li>
              <li>Sign in or create an account</li>
              <li>Click &quot;Create new secret key&quot;</li>
              <li>Copy the key (starts with <code className="px-1 rounded" style={{ background: "var(--border)" }}>sk-proj-</code>)</li>
            </ol>

            <p className="mt-4"><strong className="text-white">Step 2:</strong> Add the key to your panel</p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>SSH into your server</li>
              <li>Edit the <code className="px-1 rounded" style={{ background: "var(--border)" }}>.env</code> file in your panel directory</li>
              <li>Add this line:
                <pre className="mt-1 p-2 rounded text-xs" style={{ background: "var(--border)" }}>
                  OPENAI_API_KEY=sk-proj-your-key-here
                </pre>
              </li>
            </ol>

            <p className="mt-4"><strong className="text-white">Step 3:</strong> Restart the panel</p>
            <pre className="p-2 rounded text-xs" style={{ background: "var(--border)" }}>
              cd /home/nexlify-panel && pm2 restart nexlify
            </pre>
          </div>

          <div className="mt-4 p-3 rounded text-sm" style={{ background: "rgba(251, 191, 36, 0.1)", border: "1px solid rgba(251, 191, 36, 0.3)" }}>
            <strong>Cost:</strong> AI features use GPT-4o-mini (~$0.15/1M input tokens) and DALL-E 3 (~$0.04/image). Most panels spend less than $1/month.
          </div>
        </div>
      </div>
    );
  }

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
