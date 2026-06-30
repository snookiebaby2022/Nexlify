"use client";

import { Suspense } from "react";
import { LineAddForm } from "@/components/line-add-form";

export default function AdminLinesAddPackagePage() {
  return (
    <Suspense fallback={<p className="text-sm p-6">Loading…</p>}>
      <LineAddForm
        mode="admin"
        backHref="/admin/lines"
        manageLabel="Manage Lines"
        focusPackage={true}
      />
    </Suspense>
  );
}
