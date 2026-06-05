"use client";

import { useCallback, useEffect, useState } from "react";

type BlockType = "asn" | "ip" | "isp" | "user-agent";

export function BlocklistPage({
  type,
  title,
  description,
  valueLabel,
  valuePlaceholder,
  extraFields,
}: {
  type: BlockType;
  title: string;
  description: string;
  valueLabel: string;
  valuePlaceholder: string;
  extraFields?: { key: string; label: string; placeholder: string }[];
}) {
  const [items, setItems] = useState<{ id: string; [k: string]: unknown }[]>([]);
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    fetch(`/api/admin/blocklists?type=${type}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, string> = { type, reason };
    if (type === "asn") body.asn = value;
    else if (type === "ip") body.value = value;
    else if (type === "isp") body.name = value;
    else body.pattern = value;
    if (label) body.label = label;

    await fetch("/api/admin/blocklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setValue("");
    setLabel("");
    setReason("");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this entry?")) return;
    await fetch(`/api/admin/blocklists?type=${type}&id=${id}`, { method: "DELETE" });
    load();
  }

  function displayValue(item: Record<string, unknown>) {
    return String(item.asn ?? item.value ?? item.name ?? item.pattern ?? "—");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{description}</p>
      </div>
      <form
        onSubmit={add}
        className="rounded-lg border p-4 grid md:grid-cols-4 gap-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <input
          placeholder={valuePlaceholder}
          required
          className="rounded border px-3 py-2 bg-transparent md:col-span-2"
          style={{ borderColor: "var(--border)" }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {extraFields?.map((f) => (
          <input
            key={f.key}
            placeholder={f.placeholder}
            className="rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        ))}
        <input
          placeholder="Reason (optional)"
          className="rounded border px-3 py-2 bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          type="submit"
          className="rounded py-2 font-medium cursor-pointer md:col-span-4 md:max-w-xs"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Add {valueLabel}
        </button>
      </form>
      <div className="rounded-lg border overflow-auto" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="text-left p-3">{valueLabel}</th>
              {extraFields?.map((f) => (
                <th key={f.key} className="text-left p-3">
                  {f.label}
                </th>
              ))}
              <th className="text-left p-3">Reason</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3 font-mono text-xs">{displayValue(item)}</td>
                {extraFields?.map((f) => (
                  <td key={f.key} className="p-3" style={{ color: "var(--muted)" }}>
                    {String(item[f.key] ?? "—")}
                  </td>
                ))}
                <td className="p-3" style={{ color: "var(--muted)" }}>
                  {String(item.reason ?? "—")}
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    className="text-xs cursor-pointer"
                    style={{ color: "var(--danger)" }}
                    onClick={() => remove(item.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={10} className="p-6 text-center" style={{ color: "var(--muted)" }}>
                  No entries yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
