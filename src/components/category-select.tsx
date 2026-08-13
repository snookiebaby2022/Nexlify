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
  const options = useMemo(
    () => labeledCategoryOptions(categories, typeFilter),
    [categories, typeFilter]
  );

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
