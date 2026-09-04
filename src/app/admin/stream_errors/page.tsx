import { Suspense } from "react";
import { StreamErrorsClient } from "@/components/stream-errors-page";

export default function StreamErrorsPage() {
  return (
    <Suspense fallback={<p className="text-sm" style={{ color: "var(--muted)" }}>Loading stream errors…</p>}>
      <StreamErrorsClient />
    </Suspense>
  );
}
