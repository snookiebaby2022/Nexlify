"use client";

import { DeviceEditForm } from "@/components/device-edit-form";

export default function ResellerEnigmaEditPage() {
  return (
    <DeviceEditForm
      deviceKind="enigma"
      apiPath="/api/admin/enigma"
      listApiPath="/api/admin/enigma"
      backHref="/reseller/enigmas"
      backLabel="Enigma devices"
      title="Edit Enigma device"
    />
  );
}
