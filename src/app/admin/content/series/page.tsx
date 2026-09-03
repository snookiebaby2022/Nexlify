import { Suspense } from "react";
import { ManageSeriesTable } from "@/components/manage-series-table";

export default function SeriesPage() {
  return (
    <Suspense fallback={<p className="text-sm" style={{ color: "var(--muted)" }}>Loading series…</p>}>
      <ManageSeriesTable />
    </Suspense>
  );
}
