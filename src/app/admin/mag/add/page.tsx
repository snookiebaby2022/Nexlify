"use client";

import { DeviceAddForm } from "@/components/device-add-form";

export default function AdminMagAddPage() {
  return (
    <DeviceAddForm
      deviceKind="mag"
      withPackage
      apiPath="/api/admin/mag"
      backHref="/admin/mag"
      manageLabel="Manage MAG devices"
      title="Add MAG device"
    />
  );
}
