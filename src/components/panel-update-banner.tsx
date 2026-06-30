"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isVersionNewer } from "@/lib/panel-releases-feed";

type BannerPayload = {
  version: {
    installedVersion: string;
    updateAvailable: boolean;
    releasesFeed?: {
      latestVersion: string | null;
    } | null;
  };
};

export function PanelUpdateBanner() {
  const pathname = usePathname();
  const [data, setData] = useState<BannerPayload | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (pathname?.includes("/admin/settings/updates")) return;
    fetch("/api/admin/panel-update")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {});
  }, [pathname]);

  if (pathname?.includes("/admin/settings/updates")) return null;
  if (!data?.version) return null;

  const installed = data.version.installedVersion;
  const latest = data.version.releasesFeed?.latestVersion ?? installed;
  const hasUpdate =
    data.version.updateAvailable && isVersionNewer(latest, installed);

  if (dismissed || !hasUpdate) return null;

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
      style={{
        borderColor: "rgba(56, 189, 248, 0.35)",
        background: "linear-gradient(90deg, rgba(14, 165, 233, 0.12), rgba(99, 102, 241, 0.08))",
      }}
      role="status"
    >
      <p className="text-sm" style={{ color: "var(--fg)" }}>
        <span className="font-semibold" style={{ color: "#38bdf8" }}>
          Update available:
        </span>{" "}
        v{installed} → v{latest}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href="/admin/settings/updates"
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}
        >
          <span aria-hidden>☁</span> Update
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded px-2 py-1 text-xs cursor-pointer opacity-70 hover:opacity-100"
          style={{ color: "var(--muted)" }}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
