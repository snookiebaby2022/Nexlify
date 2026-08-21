"use client";

import { DeviceAddForm } from "@/components/device-add-form";

export default function ResellerEnigmaAddPage() {
  return (
    <DeviceAddForm
      deviceKind="enigma"
      withPackage
      apiPath="/api/admin/enigma"
      backHref="/reseller/enigmas"
      manageLabel="Manage Enigma2 devices"
      title="Add Enigma2 device"
      settingsHref={null}
    />
  );
}
