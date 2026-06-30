"use client";

import { useEffect, useState } from "react";
import { DualListPicker, type DualListItem } from "@/components/dual-list-picker";
import { FormField } from "@/components/form-page-shell";

export function StreamBouquetSection({
  selectedIds,
  onChange,
  availableTitle = "Available bouquets",
  selectedTitle = "Assigned bouquets",
}: {
  selectedIds: string[];
  onChange: (bouquetIds: string[]) => void;
  availableTitle?: string;
  selectedTitle?: string;
}) {
  const [items, setItems] = useState<DualListItem[]>([]);

  useEffect(() => {
    fetch("/api/admin/bouquets")
      .then((r) => r.json())
      .then((d) =>
        setItems(
          (d.bouquets ?? []).map((b: { id: string; name: string }) => ({
            id: b.id,
            label: b.name,
          }))
        )
      )
      .catch(() => setItems([]));
  }, []);

  return (
    <FormField label="Bouquets">
      <DualListPicker
        items={items}
        selectedIds={selectedIds}
        onChange={onChange}
        availableTitle={availableTitle}
        selectedTitle={selectedTitle}
      />
      <p className="text-[11px] mt-1.5" style={{ color: "var(--muted)" }}>
        Assign this content to one or more bouquets so lines with those packages can watch it.
      </p>
    </FormField>
  );
}
