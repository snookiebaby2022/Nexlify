"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";

type Stream = { id: string; name: string; streamUrl: string; isActive: boolean };

export default function CreatedChannelsPage() {
  const [streams, setStreams] = useState<Stream[]>([]);

  useEffect(() => {
    fetch("/api/admin/streams?created=1")
      .then((r) => r.json())
      .then((d) => setStreams(d.streams ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Created channels</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Panel-composed live channels (restream / custom inputs).
          </p>
        </div>
        <Link
          href="/admin/streams/add"
          className="text-sm px-3 py-2 rounded-md"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          + Add stream
        </Link>
      </div>
      <DataTable
        headers={["Name", "Source", "Status"]}
        rows={streams.map((s) => [
          s.name,
          <span key={s.id} className="font-mono text-xs truncate max-w-md block">
            {s.streamUrl}
          </span>,
          s.isActive ? "Active" : "Off",
        ])}
      />
      {!streams.length && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Mark a live stream as created channel when adding/editing (API:{" "}
          <code>isCreatedChannel: true</code>).
        </p>
      )}
    </div>
  );
}
