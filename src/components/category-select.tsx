"use client";

import { useMemo } from "react";
import {
  labeledCategoryOptions,
  type CategoryOptionInput,
} from "@/lib/category-options";

type Props = {
  value: string;
  onChange: (value: string) => void;
  categories: CategoryOptionInput[];
  typeFilter?: string | null;
  className?: string;
  style?: React.CSSProperties;
  emptyLabel?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  required?: boolean;
};

export function CategorySelect({
  value,
  onChange,
  categories,
  typeFilter,
  className,
  style,
  emptyLabel = "— None —",
  disabled,
  name,
  id,
  required,
}: Props) {
  const options = useMemo(() => {
    const labeled = labeledCategoryOptions(categories, typeFilter);
    // Always keep the currently selected category visible (prevents silent
    // reset to "No category" when type filter / async load would hide it).
    if (value && !labeled.some((o) => o.id === value)) {
      const current = categories.find((c) => c.id === value);
      if (current) {
        labeled.unshift({ id: current.id, label: `${current.name} (current)` });
      } else {
        labeled.unshift({ id: value, label: `Current category (${value.slice(0, 8)}…)` });
      }
    }
    return labeled;
  }, [categories, typeFilter, value]);

  return (
    <select
      id={id}
      name={name}
      required={required}
      disabled={disabled}
      className={className}
      style={style}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
