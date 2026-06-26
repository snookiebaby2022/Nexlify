"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function EnigmaBulkPage() {
  const [lines, setLines] = useState<{ id: string; username: string }[]>([]);
  const [lineId, setLineId] = useState("");
  const [model, setModel] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    fetch("/api/admin/lines")
      .then((r) => r.json())
      .then((d) => setLines(d.lines));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const macs = text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const res = await fetch("/api/admin/enigma/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId, model, macs }),
    });
    const data = await res.json();
    setResult(res.ok ? `Added ${data.imported}, skipped ${data.skipped}` : data.error ?? "Failed");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Bulk add Enigma2</h1>
      <Link href="/admin/enigmas" className="text-sm" style={{ color: "var(--accent)" }}>
        ← All Enigma devices
      </Link>
      <form
        onSubmit={submit}
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <select
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={lineId}
          onChange={(e) => setLineId(e.target.value)}
          required
        >
          <option value="">Link all to line…</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.username}
            </option>
          ))}
        </select>
        <input
          placeholder="Model (optional)"
          className="w-full rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <textarea
          placeholder="MAC addresses, one per line"
          className="w-full rounded border px-3 py-2 bg-transparent min-h-[200px] font-mono text-sm"
          style={{ borderColor: "var(--border)" }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
        <button
          type="submit"
          className="rounded py-2 px-4 cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Import MACs
        </button>
        {result && <p className="text-sm">{result}</p>}
      </form>
    </div>
  );
}
