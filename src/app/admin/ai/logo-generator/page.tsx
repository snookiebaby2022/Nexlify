"use client";

import { useState } from "react";

export default function LogoGeneratorPage() {
  const [channelName, setChannelName] = useState("");
  const [style, setStyle] = useState("modern");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setLogoUrl("");
    try {
      const res = await fetch("/api/admin/ai/logo-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelName, style }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to generate logo");
        return;
      }
      const data = await res.json();
      setLogoUrl(data.url ?? data.logoUrl ?? "");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function downloadLogo() {
    if (!logoUrl) return;
    const a = document.createElement("a");
    a.href = logoUrl;
    a.download = `${channelName || "logo"}.png`;
    a.click();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Logo Generator</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Auto-generate channel logos using AI.
        </p>
      </div>

      <form
        onSubmit={generate}
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <label className="block space-y-1">
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Channel Name
          </span>
          <input
            className="w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="e.g. Nexlify Sports"
            required
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Style
          </span>
          <select
            className="w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={style}
            onChange={(e) => setStyle(e.target.value)}
          >
            <option value="modern">Modern</option>
            <option value="minimal">Minimal</option>
            <option value="classic">Classic</option>
            <option value="neon">Neon</option>
          </select>
        </label>

        {error && (
          <div
            className="text-sm rounded border p-3"
            style={{ borderColor: "var(--border)", color: "#f87171" }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          style={{ background: "var(--accent)", color: "white" }}
        >
          {loading ? "Generating..." : "Generate Logo"}
        </button>
      </form>

      {logoUrl && (
        <div
          className="rounded-lg border p-6 space-y-4"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <h2 className="text-lg font-semibold">Generated Logo</h2>
          <div className="flex justify-center">
            <img
              src={logoUrl}
              alt={`${channelName} logo`}
              className="max-w-full h-auto rounded-lg"
              style={{ maxHeight: 400 }}
            />
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={downloadLogo}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
