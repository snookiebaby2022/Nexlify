"use client";

import { useEffect } from "react";
import { ServerForm } from "@/components/server-form";
export default function AdminServersAddPage() {
  useEffect(() => {
    fetch("/api/admin/categories/ensure-panel", { method: "POST" }).catch(() => {});
  }, []);

  return (
    <ServerForm
      mode="create"
      title="Add Server"
      manageHref="/admin/servers"
      manageLabel="Manage Servers"
    />
  );
}
