"use client";

import {
  ACCESS_OUTPUT_OPTIONS,
  type AccessOutputId,
} from "@/lib/line-access-output";

export function AccessOutputCheckboxes({
  selected,
  onChange,
  legend = "Access Output",
  hint = "Formats this line may use for playback (Xtream allowed_output_formats). All enabled by default.",
}: {
  selected: Set<AccessOutputId>;
  onChange: (next: Set<AccessOutputId>) => void;
  legend?: string;
  hint?: string;
}) {
  function toggle(id: AccessOutputId) {
    const next = new Set(selected);
    if (next.has(id)) {
      if (next.size <= 1) return; // keep at least one format
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  }

  return (
    <fieldset className="text-sm space-y-2">
      <legend className="mb-1.5 font-medium">{legend}</legend>
      {hint ? (
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-4 pt-1">
        {ACCESS_OUTPUT_OPTIONS.map((opt) => (
          <label key={opt.id} className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selected.has(opt.id)}
              onChange={() => toggle(opt.id)}
              className="h-4 w-4 rounded border accent-[var(--accent)]"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
