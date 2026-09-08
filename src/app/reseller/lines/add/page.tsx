"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LineAddForm } from "@/components/line-add-form";
import { PanelRouteFallback } from "@/components/panel-route-fallback";

function ResellerLinesAddContent() {
  const searchParams = useSearchParams();
  const focusPackage = searchParams.get("package") === "1";
  return (
    <LineAddForm
      mode="reseller"
      backHref="/reseller/lines"
      manageLabel="Manage Lines"
      focusPackage={focusPackage}
    />
  );
}

export default function ResellerAddLinePage() {
  return (
    <Suspense fallback={<PanelRouteFallback />}>
      <ResellerLinesAddContent />
    </Suspense>
  );
}
