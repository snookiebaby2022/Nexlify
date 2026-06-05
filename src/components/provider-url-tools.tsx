"use client";

import { useEffect, useState } from "react";

type Provider = { id: string; name: string; baseUrl: string };

export function ProviderUrlTools() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [streamType, setStreamType] = useState("");
  const [result, setResult] = useState("");
  const [preview, setPreview] = useState("");

  useEffect(() => {
    fetch("/api/admin/stream-providers")
      .then((r) => r.json())
      .then((d) => {
        const list = d.providers ?? [];
        setProviders(list);
        if (list[0]) {
          setProviderId(list[0].id);
          setNewBaseUrl(list[0].baseUrl);
        }
      });
  }, []);

  useEffect(() => {
    const p = providers.find((x) => x.id === providerId);
    if (p) setNewBaseUrl(p.baseUrl);
  }, [providerId, providers]);

  async function runProviderUpdate(dryRun: boolean) {
    setResult(dryRun ? "Previewing provider update…" : "Updating provider…");
    setPreview("");
    const res = await fetch("/api/admin/tools/provider-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateProviderBase",
        providerId,
        newBaseUrl,
        cascadeStreams: true,
        dryRun,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setResult(`Error: ${data.error ?? res.statusText}`);
      return;
    }
    if (dryRun) {
      setPreview(`Would refresh ${data.streams?.matched ?? 0} linked streams`);
      setResult("Preview complete.");
      return;
    }
    setResult(
      `Provider updated. Refreshed ${data.streams?.updated ?? 0} of ${data.streams?.matched ?? 0} linked streams. Status: ${data.probe?.status ?? "—"}`
    );
  }

  async function runCascade(dryRun: boolean) {
    setResult(dryRun ? "Previewing cascade…" : "Cascading URLs…");
    const res = await fetch("/api/admin/tools/provider-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cascadeProvider", providerId, dryRun }),
    });
    const data = await res.json();
    if (!res.ok) {
      setResult(`Error: ${data.error ?? res.statusText}`);
      return;
    }
    setResult(
      dryRun
        ? `Would update ${data.matched} streams`
        : `Updated ${data.updated} of ${data.matched} streams`
    );
  }

  async function runUrlReplace(dryRun: boolean) {
    if (!find.trim()) {
      setResult("Enter text to find in stream URLs.");
      return;
    }
    setResult(dryRun ? "Previewing URL replace…" : "Replacing URLs…");
    setPreview("");
    const res = await fetch("/api/admin/tools/provider-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "replaceUrl",
        find,
        replace,
        type: streamType || undefined,
        dryRun,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setResult(`Error: ${data.error ?? res.statusText}`);
      return;
    }
    if (data.preview?.length) {
      setPreview(
        data.preview
          .slice(0, 8)
          .map((p: { name: string; before: string; after: string }) => `${p.name}\n  ${p.before}\n  → ${p.after}`)
          .join("\n\n")
      );
    }
    setResult(
      dryRun
        ? `Would update ${data.matched} streams`
        : `Updated ${data.updated} of ${data.matched} streams`
    );
  }

  return (
    <div className="space-y-8 max-w-3xl text-sm">
      <section className="space-y-3 rounded-lg p-4" style={{ border: "1px solid var(--border)" }}>
        <h2 className="font-semibold">Provider base URL change</h2>
        <p className="opacity-70">
          When a provider changes their base URL, update it here and refresh all linked stream URLs
          automatically.
        </p>
        <label className="block">
          Provider
          <select
            className="mt-1 w-full rounded px-3 py-2"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          New base URL
          <input
            className="mt-1 w-full rounded px-3 py-2 font-mono text-xs"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            value={newBaseUrl}
            onChange={(e) => setNewBaseUrl(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            onClick={() => runProviderUpdate(true)}
          >
            Preview
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded"
            style={{ background: "var(--accent)", color: "#fff" }}
            onClick={() => runProviderUpdate(false)}
          >
            Update &amp; refresh streams
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            onClick={() => runCascade(false)}
          >
            Refresh linked streams only
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-lg p-4" style={{ border: "1px solid var(--border)" }}>
        <h2 className="font-semibold">Bulk find &amp; replace in stream URLs</h2>
        <p className="opacity-70">
          Quickly update direct stream URLs when a host or path segment changes across many channels.
        </p>
        <label className="block">
          Find in URL
          <input
            className="mt-1 w-full rounded px-3 py-2 font-mono text-xs"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            placeholder="http://old-provider.com"
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
        </label>
        <label className="block">
          Replace with
          <input
            className="mt-1 w-full rounded px-3 py-2 font-mono text-xs"
            placeholder="http://new-provider.com"
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
          />
        </label>
        <label className="block">
          Stream type (optional)
          <select
            className="mt-1 w-full rounded px-3 py-2"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            value={streamType}
            onChange={(e) => setStreamType(e.target.value)}
          >
            <option value="">All types</option>
            <option value="LIVE">Live</option>
            <option value="MOVIE">Movies</option>
            <option value="SERIES">Series</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            onClick={() => runUrlReplace(true)}
          >
            Preview
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded"
            style={{ background: "var(--accent)", color: "#fff" }}
            onClick={() => runUrlReplace(false)}
          >
            Replace all matches
          </button>
        </div>
      </section>

      {preview && (
        <pre
          className="text-xs whitespace-pre-wrap rounded p-3"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          {preview}
        </pre>
      )}
      {result && (
        <pre
          className="text-sm whitespace-pre-wrap rounded p-3"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}
