"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { ExpiringLineRow } from "@/lib/dashboard-widgets";

type WidgetData = {
  expiringLines?: ExpiringLineRow[];
  recentlyExpired?: ExpiringLineRow[];
  showOwner?: boolean;
};

function urgencyColor(daysLeft: number, expired?: boolean) {
  if (expired) return "var(--danger)";
  if (daysLeft <= 1) return "var(--danger)";
  if (daysLeft <= 3) return "#f39c12";
  return "var(--muted)";
}

function LineTable({
  title,
  icon,
  rows,
  linesHref,
  showOwner,
  mode,
}: {
  title: string;
  icon: ReactNode;
  rows: ExpiringLineRow[];
  linesHref: string;
  showOwner: boolean;
  mode: "soon" | "recent";
}) {
  return (
    <div
      className="rounded-xl border p-4 h-full"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
        <span
          className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ background: "var(--border)", color: "var(--muted)" }}
        >
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: "var(--muted)" }}>
          {mode === "soon" ? "No lines expiring in the next 7 days" : "No recently expired lines"}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                <th className="text-left py-1.5 font-medium">Username</th>
                {showOwner && <th className="text-left py-1.5 font-medium">Owner</th>}
                <th className="text-left py-1.5 font-medium">Type</th>
                <th className="text-left py-1.5 font-medium">Expires</th>
                <th className="text-right py-1.5 font-medium">{mode === "soon" ? "Left" : "Ago"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((line) => (
                <tr key={line.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-2">
                    <Link
                      href={`${linesHref}?edit=${line.id}`}
                      className="font-medium hover:underline"
                      style={{ color: "var(--accent)" }}
                    >
                      {line.username}
                    </Link>
                  </td>
                  {showOwner && (
                    <td className="py-2 pr-2 truncate max-w-[100px]" style={{ color: "var(--muted)" }}>
                      {line.ownerUsername ?? "—"}
                    </td>
                  )}
                  <td className="py-2 pr-2 uppercase" style={{ color: "var(--muted)" }}>
                    {line.deviceType}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {formatDateTime(line.expiresAt)}
                  </td>
                  <td
                    className="py-2 text-right font-semibold whitespace-nowrap"
                    style={{ color: urgencyColor(line.daysLeft, mode === "recent") }}
                  >
                    {mode === "soon"
                      ? line.daysLeft === 0
                        ? "Today"
                        : `${line.daysLeft}d`
                      : `${line.daysLeft}d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Link
        href={linesHref}
        className="text-xs underline mt-3 inline-block"
        style={{ color: "var(--accent)" }}
      >
        Manage all lines
      </Link>
    </div>
  );
}

export function DashboardExpiringLines({
  widgetsUrl,
  linesHref,
}: {
  widgetsUrl: string;
  linesHref: string;
}) {
  const [data, setData] = useState<WidgetData | null>(null);

  const load = useCallback(() => {
    fetch(widgetsUrl)
      .then((r) => r.json())
      .then((payload: WidgetData) => setData(payload))
      .catch(() => setData(null));
  }, [widgetsUrl]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const showOwner = data?.showOwner ?? false;

  return (
    <div className="grid lg:grid-cols-2 gap-4" data-dashboard-expiring>
      <LineTable
        title="Expiring in 7 days"
        icon={<Clock size={16} style={{ color: "#f39c12" }} />}
        rows={data?.expiringLines ?? []}
        linesHref={linesHref}
        showOwner={showOwner}
        mode="soon"
      />
      <LineTable
        title="Recently expired"
        icon={<AlertTriangle size={16} style={{ color: "var(--danger)" }} />}
        rows={data?.recentlyExpired ?? []}
        linesHref={linesHref}
        showOwner={showOwner}
        mode="recent"
      />
    </div>
  );
}
