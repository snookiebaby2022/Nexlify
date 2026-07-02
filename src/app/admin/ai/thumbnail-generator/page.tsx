"use client";

import { useState } from "react";

export default function ThumbnailGeneratorPage() {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("movie");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setThumbnailUrl("");
    try {
      const res = await fetch("/api/admin/ai/thumbnail-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, type, genre, description }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to generate thumbnail");
        return;
      }
      const data = await res.json();
      setThumbnailUrl(data.url ?? data.thumbnailUrl ?? "");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function downloadThumbnail() {
    if (!thumbnailUrl) return;
    const a = document.createElement("a");
    a.href = thumbnailUrl;
    a.download = `${title || "thumbnail"}.png`;
    a.click();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Thumbnail Generator</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          AI-powered thumbnail generation for movies and series.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          onSubmit={generate}
          className="rounded-lg border p-6 space-y-4"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Title
            </span>
            <input
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Last Frontier"
              required
            />
          </label>

          <div className="space-y-2">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Type
            </span>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="type"
                  value="movie"
                  checked={type === "movie"}
                  onChange={(e) => setType(e.target.value)}
                  className="accent-current"
                  style={{ color: "var(--accent)" }}
                />
                <span className="text-sm">Movie</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="type"
                  value="series"
                  checked={type === "series"}
                  onChange={(e) => setType(e.target.value)}
                  className="accent-current"
                  style={{ color: "var(--accent)" }}
                />
                <span className="text-sm">Series</span>
              </label>
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Genre
            </span>
            <input
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="e.g. Sci-Fi, Action, Drama"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Description
            </span>
            <textarea
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief plot summary or mood description..."
            />
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
            {loading ? "Generating..." : "Generate Thumbnail"}
          </button>
        </form>

        <div
          className="rounded-lg border p-6 flex flex-col items-center justify-center gap-4"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          {thumbnailUrl ? (
            <>
              <div
                className="w-full max-w-[280px] overflow-hidden rounded-lg"
                style={{ aspectRatio: "2/3" }}
              >
                <img
                  src={thumbnailUrl}
                  alt={title}
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={downloadThumbnail}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "white" }}
              >
                Download
              </button>
            </>
          ) : (
            <div className="text-center space-y-2">
              <div
                className="w-[200px] h-[300px] rounded-lg border-2 border-dashed flex items-center justify-center"
                style={{ borderColor: "var(--border)" }}
              >
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Preview
                </p>
              </div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                2:3 aspect ratio &middot; Movie poster format
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
