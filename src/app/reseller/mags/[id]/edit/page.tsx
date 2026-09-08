"use client";

import { DeviceEditForm } from "@/components/device-edit-form";

export default function ResellerMagEditPage() {
  return (
    <DeviceEditForm
      deviceKind="mag"
      apiPath="/api/admin/mag"
      listApiPath="/api/admin/mag"
      backHref="/reseller/mags"
      backLabel="MAG devices"
      title="Edit MAG device"
    />
  );
}
