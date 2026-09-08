"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LineAddForm } from "@/components/line-add-form";
import { PanelRouteFallback } from "@/components/panel-route-fallback";

function AdminLinesAddContent() {
  const searchParams = useSearchParams();
  const focusPackage = searchParams.get("package") === "1";
  return (
    <LineAddForm
      mode="admin"
      backHref="/admin/lines"
      manageLabel="Manage Lines"
      focusPackage={focusPackage}
    />
  );
}

export default function AdminLinesAddPage() {
  return (
    <Suspense fallback={<PanelRouteFallback />}>
      <AdminLinesAddContent />
    </Suspense>
  );
}
