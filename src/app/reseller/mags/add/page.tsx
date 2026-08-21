"use client";

import { DeviceAddForm } from "@/components/device-add-form";

export default function ResellerMagAddPage() {
  return (
    <DeviceAddForm
      deviceKind="mag"
      withPackage
      apiPath="/api/admin/mag"
      backHref="/reseller/mags"
      manageLabel="Manage MAG devices"
      title="Add MAG device"
      settingsHref={null}
    />
  );
}
