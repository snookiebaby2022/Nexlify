"use client";

import { useRouter } from "next/navigation";
import { PackageForm } from "@/components/package-form";

export default function AddPackagePage() {
  const router = useRouter();
  return (
    <PackageForm
      title="Add Package"
      submitLabel="Create package"
      onSuccess={() => router.push("/admin/management/packages")}
    />
  );
}
