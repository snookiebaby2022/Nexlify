"use client";

import { useState } from "react";
import Link from "next/link";

type BouquetResult = {
  name: string;
  streams: { name: string; reason: string }[];
  estimatedReach: number;
  reasoning: string;
};

export default function BouquetBuilderPage() {
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState("");
  const [maxChannels, setMaxChannels] = useState(20);
  const [result, setResult] = useState<BouquetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/ai/bouquet-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, audience, maxChannels }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to generate bouquet");
      }
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Smart Bouquet Builder</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Describe your ideal bouquet and let AI assemble it.
          </p>
        </div>
        <Link href="/admin/ai" className="px-4 py-2 rounded-lg text-sm font-medium transition-colors" style={{ background: "var(--border)", color: "var(--muted)" }}>
          Back
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <div>
          <label className="block text-sm font-medium mb-1">Describe your bouquet</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent resize-none h-24"
            style={{ borderColor: "var(--border)" }}
            placeholder="e.g. Premium sports package with HD channels, dedicated to football fans in the UK..."
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Target Audience</label>
            <input
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--border)" }}
              placeholder="e.g. UK sports enthusiasts, ages 25-45"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max Channels</label>
            <input
              type="number"
              value={maxChannels}
              onChange={(e) => setMaxChannels(Number(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
              style={{ borderColor: "var(--border)" }}
              min={1}
              max={500}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading || !description.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          style={{ background: "var(--accent)", color: "white" }}
        >
          {loading ? "Generating..." : "Generate Bouquet"}
        </button>
      </form>

      {error && (
        <p className="text-sm rounded border p-3" style={{ borderColor: "var(--border)", color: "#f87171" }}>
          {error}
        </p>
      )}

      {loading && <p className="text-sm" style={{ color: "var(--muted)" }}>AI is building your bouquet...</p>}

      {result && (
        <div className="space-y-4">
          <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="text-xs uppercase font-medium mb-1" style={{ color: "var(--muted)" }}>Suggested Name</div>
            <div className="text-xl font-semibold">{result.name}</div>
          </div>

          <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="text-xs uppercase font-medium mb-1" style={{ color: "var(--muted)" }}>Estimated Reach</div>
            <div className="text-xl font-semibold" style={{ color: "var(--accent)" }}>{result.estimatedReach.toLocaleString()} users</div>
          </div>

          <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <div className="px-4 py-3 font-medium text-sm" style={{ borderBottom: "1px solid var(--border)" }}>
              Selected Streams ({result.streams.length})
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {result.streams.map((s, i) => (
                <div key={i} className="px-4 py-3 flex items-start justify-between gap-4 text-sm" style={{ borderColor: "var(--border)" }}>
                  <span className="font-medium">{s.name}</span>
                  <span className="text-right flex-1" style={{ color: "var(--muted)" }}>{s.reason}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="text-xs uppercase font-medium mb-2" style={{ color: "var(--muted)" }}>AI Reasoning</div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{result.reasoning}</p>
          </div>
        </div>
      )}
    </div>
  );
}
