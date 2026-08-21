"use client";

import { useParams } from "next/navigation";
import { PackageForm } from "@/components/package-form";

export default function EditPackagePage() {
  const params = useParams();
  const id = String(params.id ?? "");

  return (
    <PackageForm
      packageId={id}
      title="Edit package"
      submitLabel="Save changes"
    />
  );
}
