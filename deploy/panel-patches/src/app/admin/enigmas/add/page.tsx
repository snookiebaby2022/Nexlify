"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DeviceAddForm } from "@/components/device-add-form";

function AdminEnigmaAddContent() {
  const searchParams = useSearchParams();
  const withPackage = searchParams.get("package") === "1";

  return (
    <DeviceAddForm
      deviceKind="enigma"
      withPackage={withPackage}
      apiPath="/api/admin/enigma"
      backHref="/admin/enigmas"
      manageLabel="Manage Enigma2 devices"
      title={withPackage ? "Add Enigma2 device (with package)" : "Add Enigma2 device"}
    />
  );
}

export default function AdminEnigmaAddPage() {
  return (
    <Suspense fallback={<p className="text-sm p-6">Loading…</p>}>
      <AdminEnigmaAddContent />
    </Suspense>
  );
}
