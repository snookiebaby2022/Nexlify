"use client";

import { use } from "react";
import { ServerForm } from "@/components/server-form";

export default function AdminServerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <ServerForm
      mode="edit"
      serverId={id}
      title="Edit Server"
      manageHref="/admin/servers"
      manageLabel="Manage Servers"
    />
  );
}
