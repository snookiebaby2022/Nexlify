"use client";

import { useState } from "react";

type QueryResult = {
  query: string;
  sqlDescription: string;
  columns: string[];
  rows: (string | number)[][];
  count: number;
};

type HistoryEntry = {
  query: string;
  timestamp: string;
  count: number;
};

export default function NaturalLanguagePage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/admin/ai/natural-language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to process query");
      }
      const data: QueryResult = await res.json();
      setResult(data);
      setHistory((prev) => [
        { query: q, timestamp: new Date().toLocaleString(), count: data.count },
        ...prev,
      ]);
      setInput("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Natural Language Admin</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Ask questions about your panel in plain English — the AI generates and runs the query for you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your panel... (e.g. 'Show me all lines expiring this week')"
          className="flex-1 rounded-lg border px-4 py-2.5 text-sm bg-transparent outline-none focus:ring-1"
          style={{ borderColor: "var(--border)", background: "var(--bg)" }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          style={{ background: "var(--accent)", color: "white" }}
        >
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>

      {error && (
        <p className="text-sm rounded border p-3" style={{ borderColor: "var(--border)", color: "#f87171" }}>
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs uppercase mb-1" style={{ color: "var(--muted)" }}>
              Your query
            </div>
            <div className="text-sm font-medium">{result.query}</div>
          </div>

          <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs uppercase mb-1" style={{ color: "var(--muted)" }}>
              Generated SQL
            </div>
            <code className="text-xs block" style={{ color: "var(--accent)" }}>
              {result.sqlDescription}
            </code>
          </div>

          <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs uppercase" style={{ color: "var(--muted)" }}>
                Results
              </div>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--accent)", color: "white" }}>
                {result.count} {result.count === 1 ? "row" : "rows"}
              </span>
            </div>

            {result.rows.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No results found.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {result.columns.map((col) => (
                        <th key={col} className="text-left py-2 px-3 font-medium text-xs uppercase" style={{ color: "var(--muted)" }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: "1px solid var(--border)" }}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="py-2 px-3 whitespace-nowrap">
                            {String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="rounded-lg border p-8 text-center" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Type a question above to get started.
          </p>
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-medium mb-3" style={{ color: "var(--muted)" }}>
            Query History
          </h2>
          <ul className="space-y-2">
            {history.map((h, i) => (
              <li key={i} className="flex items-center justify-between text-sm py-2 px-3 rounded" style={{ background: "var(--bg)" }}>
                <span className="truncate mr-4">{h.query}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {h.count} {h.count === 1 ? "row" : "rows"}
                  </span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {h.timestamp}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
