"use client";

import { FormField, formInputClass, formInputStyle } from "@/components/form-page-shell";
import { parseIntAllowEmpty } from "@/lib/form-number";

export function MaxConnectionsField({
  value,
  onChange,
  allowUnlimited = true,
  min = 1,
  hint,
}: {
  value: number | "";
  onChange: (value: number | "") => void;
  allowUnlimited?: boolean;
  min?: number;
  hint?: string;
}) {
  const unlimited = allowUnlimited && value === 0;
  const floor = Math.max(1, min);
  return (
    <FormField label="Max Connections">
      <input
        type="number"
        min={allowUnlimited ? 0 : floor}
        className={formInputClass}
        style={formInputStyle}
        value={unlimited ? 0 : value}
        onChange={(e) => {
          const next = parseIntAllowEmpty(e.target.value);
          if (next === "") {
            onChange("");
            return;
          }
          if (!allowUnlimited && next === 0) {
            onChange(floor);
            return;
          }
          onChange(next);
        }}
      />
      {allowUnlimited ? (
        <label className="mt-2 flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(e) => onChange(e.target.checked ? 0 : Math.max(1, floor))}
          />
          Unlimited connections
        </label>
      ) : null}
      <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
        {hint
          ? hint
          : allowUnlimited
            ? "0 or Unlimited = no simultaneous-stream cap. Any positive number is a hard limit."
            : "Package includes the default connections. Extra connections are billed from your credits."}
      </p>
    </FormField>
  );
}
