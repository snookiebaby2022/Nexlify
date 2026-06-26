"use client";



import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { ManageUsersTable, type ManageUserRow } from "@/components/manage-users-table";



export default function AdminManageUsersPage() {

  const [users, setUsers] = useState<ManageUserRow[]>([]);

  const [loading, setLoading] = useState(true);



  const load = useCallback(() => {

    setLoading(true);

    fetch("/api/admin/resellers")

      .then((r) => r.json())

      .then((d) => {

        setUsers(d.users ?? d.resellers ?? []);

        setLoading(false);

      })

      .catch(() => setLoading(false));

  }, []);



  useEffect(() => {

    load();

  }, [load]);



  return (

    <div className="space-y-4">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div className="flex flex-wrap gap-2 text-sm items-center">

          <Link href="/admin/resellers/credits" className="link-back hover:underline">

            Credit log

          </Link>

          <span style={{ color: "var(--muted)" }}>·</span>

          <Link href="/admin/resellers/sub" className="hover:underline" style={{ color: "var(--accent)" }}>

            Sub-resellers

          </Link>

        </div>

        <Link

          href="/admin/resellers/add"

          className="text-sm px-4 py-2 rounded-md font-medium shrink-0"

          style={{ background: "var(--accent)", color: "#fff" }}

        >

          + Add User

        </Link>

      </div>



      {loading ? (

        <p className="text-sm" style={{ color: "var(--muted)" }}>

          Loading users…

        </p>

      ) : (

        <ManageUsersTable users={users} onRefresh={load} />

      )}

    </div>

  );

}


