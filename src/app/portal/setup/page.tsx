"use client";

import Link from "next/link";

const PLAYERS = [
  {
    name: "TiviMate",
    steps: [
      "Open TiviMate → Add playlist → Xtream Codes API",
      "Enter server URL (host from your Xtream API link), username, and password from the portal dashboard.",
      "EPG URL is optional if included in Xtream response.",
    ],
  },
  {
    name: "OTT Navigator",
    steps: [
      "Menu → Playlists → Add → Xtream Codes",
      "Paste Xtream API URL or enter host, username, password separately.",
      "Enable EPG from provider if channels show no guide.",
    ],
  },
  {
    name: "IPTV Smarters / Smarters Pro",
    steps: [
      "Login with Xtream Codes API",
      "Use credentials from Subscriber Portal dashboard.",
    ],
  },
  {
    name: "MAG / Stalker",
    steps: [
      "Set Portal URL to the Stalker URL from your dashboard.",
      "Enter device MAC in your provider panel if required.",
    ],
  },
];

export default function PortalSetupPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: "#0a1628" }}>
      <header
        className="border-b px-6 py-4 flex items-center gap-4"
        style={{ borderColor: "#1e3a5f", background: "#111b2e" }}
      >
        <Link href="/portal/dashboard" className="text-sm" style={{ color: "#22d3ee" }}>
          ← Dashboard
        </Link>
        <h1 className="text-xl font-semibold">Player setup guide</h1>
      </header>
      <main className="max-w-3xl mx-auto p-6 space-y-6">
        {PLAYERS.map((p) => (
          <section
            key={p.name}
            className="rounded-xl border p-5"
            style={{ borderColor: "#1e3a5f", background: "#111b2e" }}
          >
            <h2 className="font-semibold text-lg mb-3">{p.name}</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm" style={{ color: "#cbd5e1" }}>
              {p.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </section>
        ))}
      </main>
    </div>
  );
}
