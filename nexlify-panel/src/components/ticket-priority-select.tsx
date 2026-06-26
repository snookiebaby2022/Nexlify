"use client";

const PRIORITIES = [
  { value: "LOW", label: "Low", hint: "General question, no rush" },
  { value: "NORMAL", label: "Normal", hint: "Standard support request" },
  { value: "HIGH", label: "High", hint: "Service impact, needs attention soon" },
  { value: "URGENT", label: "Urgent", hint: "Critical outage — needs immediate attention" },
] as const;

export function TicketPrioritySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const selected = PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[1];

  return (
    <div className="space-y-2">
      <span className="text-sm block" style={{ color: "var(--muted)" }}>
        Priority
      </span>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PRIORITIES.map((p) => {
          const active = value === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              className="rounded-lg border px-3 py-2 text-left text-sm cursor-pointer transition-colors"
              style={{
                borderColor: active ? "var(--accent)" : "var(--border)",
                background: active ? "color-mix(in srgb, var(--accent) 12%, var(--bg-card))" : "var(--bg-card)",
                boxShadow: active ? "0 0 0 1px var(--accent)" : undefined,
              }}
            >
              <div className="font-medium">{p.label}</div>
            </button>
          );
        })}
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {selected.hint}
      </p>
    </div>
  );
}
