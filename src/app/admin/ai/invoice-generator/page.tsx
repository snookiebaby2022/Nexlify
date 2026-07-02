"use client";

import { useState } from "react";

export default function InvoiceGeneratorPage() {
  const [lineId, setLineId] = useState("");
  const [template, setTemplate] = useState("standard");
  const [language, setLanguage] = useState("English");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    description: string;
    lineItems: { item: string; quantity: number; rate: number; amount: number }[];
    notes: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/ai/invoice-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineId: lineId || undefined,
          template,
          language,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to generate invoice");
        return;
      }
      const data = await res.json();
      setResult(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard() {
    if (!result) return;
    const text = `${result.description}\n\n${result.lineItems
      .map((l) => `${l.item}  x${l.quantity}  $${l.rate.toFixed(2)}  $${l.amount.toFixed(2)}`)
      .join("\n")}\n\n${result.notes}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Invoice Generator</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Auto-generate professional invoice descriptions using AI.
        </p>
      </div>

      <form
        onSubmit={generate}
        className="rounded-lg border p-6 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <label className="block space-y-1">
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Line ID (optional)
          </span>
          <input
            className="w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            placeholder="Leave blank for generic invoice"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Template
            </span>
            <select
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              <option value="standard">Standard</option>
              <option value="detailed">Detailed</option>
              <option value="minimal">Minimal</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Language
            </span>
            <select
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="English">English</option>
              <option value="Spanish">Spanish</option>
              <option value="French">French</option>
              <option value="German">German</option>
              <option value="Arabic">Arabic</option>
            </select>
          </label>
        </div>

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
          {loading ? "Generating..." : "Generate Invoice"}
        </button>
      </form>

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Generated Invoice</h2>
            <button
              type="button"
              onClick={copyToClipboard}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {copied ? "Copied!" : "Copy to Clipboard"}
            </button>
          </div>

          <div
            className="rounded-lg border p-5 space-y-4"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div
              className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: "var(--muted)" }}
            >
              {result.description}
            </div>
          </div>

          {result.lineItems.length > 0 && (
            <div
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left px-4 py-3 font-medium">Item</th>
                    <th className="text-right px-4 py-3 font-medium">Qty</th>
                    <th className="text-right px-4 py-3 font-medium">Rate</th>
                    <th className="text-right px-4 py-3 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lineItems.map((item, i) => (
                    <tr
                      key={i}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td className="px-4 py-2">{item.item}</td>
                      <td className="text-right px-4 py-2">{item.quantity}</td>
                      <td className="text-right px-4 py-2">
                        ${item.rate.toFixed(2)}
                      </td>
                      <td className="text-right px-4 py-2">
                        ${item.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.notes && (
            <div
              className="rounded-lg border p-4"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <h3 className="text-sm font-medium mb-2">Notes</h3>
              <p
                className="text-sm whitespace-pre-wrap"
                style={{ color: "var(--muted)" }}
              >
                {result.notes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
