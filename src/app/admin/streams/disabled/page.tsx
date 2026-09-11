import { Suspense } from "react";
import { DisabledStreamsClient } from "@/components/disabled-streams-page";

export default function DisabledStreamsPage() {
  return (
    <Suspense fallback={<p className="text-sm" style={{ color: "var(--muted)" }}>Loading disabled streams…</p>}>
      <DisabledStreamsClient />
    </Suspense>
  );
}
