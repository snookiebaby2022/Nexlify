"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";

type PlexCron = {
  enabled: boolean;
  intervalHours: number;
  lastAutoSyncAt: string | null;
  nextDueAt: string | null;
  dueNow: boolean;
  lastCronStatus: string | null;
  lastCronMessage: string | null;
  lastCronAt: string | null;
};

export function PlexAutoSyncStatus() {
  const [cron, setCron] = useState<PlexCron | null>(null);

  useEffect(() => {
    fetch("/api/admin/integrations?type=plex")
      .then((r) => r.json())
      .then((d) => {
        if (d.plexCron) setCron(d.plexCron as PlexCron);
      })
      .catch(() => {});
  }, []);

  if (!cron) return null;

  const err = cron.lastCronStatus === "error";

  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm space-y-1"
      style={{ borderColor: err ? "var(--danger)" : "var(--border)" }}
    >
      <p className="font-medium">Plex auto-sync</p>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {cron.enabled ? `Every ${cron.intervalHours} hours` : "Disabled"}
        {cron.lastAutoSyncAt ? ` · last run ${formatDateTime(cron.lastAutoSyncAt)}` : " · never run"}
        {cron.dueNow
          ? " · due now"
          : cron.nextDueAt
            ? ` · next ${formatDateTime(cron.nextDueAt)}`
            : ""}
      </p>
      {cron.lastCronMessage && (
        <p className="text-xs" style={{ color: err ? "var(--danger)" : "var(--muted)" }}>
          Last cron: {cron.lastCronStatus ?? "—"}
          {cron.lastCronAt ? ` (${formatDateTime(cron.lastCronAt)})` : ""} — {cron.lastCronMessage}
        </p>
      )}
      <p className="text-xs">
        <Link href="/admin/settings/cron" className="underline" style={{ color: "var(--accent)" }}>
          Scheduled tasks
        </Link>
      </p>
    </div>
  );
}
