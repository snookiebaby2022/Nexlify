"use client";

import { DeviceAddForm } from "@/components/device-add-form";

export default function AdminEnigmaAddPage() {
  return (
    <DeviceAddForm
      deviceKind="enigma"
      withPackage
      apiPath="/api/admin/enigma"
      backHref="/admin/enigmas"
      manageLabel="Manage Enigma2 devices"
      title="Add Enigma2 device"
    />
  );
}
