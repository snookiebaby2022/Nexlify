"use client";

import { FormField, formInputClass, formInputStyle } from "@/components/form-page-shell";
import { parseIntAllowEmpty } from "@/lib/form-number";

export function MaxConnectionsField({
  value,
  onChange,
}: {
  value: number | "";
  onChange: (value: number | "") => void;
}) {
  const unlimited = value === 0;
  return (
    <FormField label="Max Connections">
      <input
        type="number"
        min={0}
        className={formInputClass}
        style={formInputStyle}
        value={unlimited ? 0 : value}
        onChange={(e) => onChange(parseIntAllowEmpty(e.target.value))}
      />
      <label className="mt-2 flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={unlimited}
          onChange={(e) => onChange(e.target.checked ? 0 : 1)}
        />
        Unlimited connections
      </label>
      <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
        0 or Unlimited = no simultaneous-stream cap. Any positive number is a hard limit.
      </p>
    </FormField>
  );
}
