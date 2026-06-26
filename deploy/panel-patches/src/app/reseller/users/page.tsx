"use client";

import { useCallback, useEffect, useState } from "react";
import { ManageUsersTable, type ManageUserRow } from "@/components/manage-users-table";

export default function ResellerManageUsersPage() {
  const [users, setUsers] = useState<ManageUserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/reseller/users")
      .then((r) => r.json())
      .then((d) => {
        setUsers(d.users ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <p className="text-sm p-6" style={{ color: "var(--muted)" }}>
        Loading users…
      </p>
    );
  }

  return <ManageUsersTable panel="reseller" users={users} onRefresh={load} />;
}
