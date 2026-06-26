"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LineAddForm } from "@/components/line-add-form";

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
    <Suspense fallback={<p className="text-sm p-6">Loading…</p>}>
      <AdminLinesAddContent />
    </Suspense>
  );
}
