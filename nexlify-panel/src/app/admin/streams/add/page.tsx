"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { StreamAddForm, type StreamAddInitial } from "@/components/stream-add-form";

function AddStreamInner() {
  const sp = useSearchParams();
  const initial: StreamAddInitial = {
    name: sp.get("name") ?? undefined,
    streamUrl: sp.get("source") ?? sp.get("streamUrl") ?? undefined,
    isRadio: sp.get("radio") === "1" || sp.get("isRadio") === "1",
  };
  const fromRadio = sp.get("from") === "radios" || initial.isRadio;
  return (
    <StreamAddForm
      defaultType="LIVE"
      title={fromRadio ? "Add Radio Stream" : "Add Stream"}
      backHref={fromRadio ? "/admin/radios" : "/admin/streams"}
      initial={initial}
    />
  );
}

export default function AddStreamPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm" style={{ color: "var(--muted)" }}>Loading form…</p>}>
      <AddStreamInner />
    </Suspense>
  );
}
