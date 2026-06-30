"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DeviceAddForm } from "@/components/device-add-form";

function AdminMagAddContent() {
  const searchParams = useSearchParams();
  const withPackage = searchParams.get("package") === "1";

  return (
    <DeviceAddForm
      deviceKind="mag"
      withPackage={withPackage}
      apiPath="/api/admin/mag"
      backHref="/admin/mag"
      manageLabel="Manage MAG devices"
      title={withPackage ? "Add MAG device (with package)" : "Add MAG device"}
    />
  );
}

export default function AdminMagAddPage() {
  return (
    <Suspense fallback={<p className="text-sm p-6">Loading…</p>}>
      <AdminMagAddContent />
    </Suspense>
  );
}
