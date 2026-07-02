"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LineAddForm } from "@/components/line-add-form";

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
    <Suspense fallback={<p className="text-sm p-6">Loading…</p>}>
      <ResellerLinesAddContent />
    </Suspense>
  );
}
