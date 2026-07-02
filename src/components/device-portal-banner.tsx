"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function DevicePortalBanner({
  deviceKind,
  settingsHref = "/admin/settings/server",
}: {
  deviceKind: "mag" | "enigma";
  settingsHref?: string | null;
}) {
  const [portalUrl, setPortalUrl] = useState("—");
  const portalKey = deviceKind === "mag" ? "magServerUrl" : "enigmaServerUrl";

  useEffect(() => {
    fetch("/api/admin/portal-urls")
      .then((r) => r.json())
      .then((d) => setPortalUrl(d[portalKey] || d.magServerUrl || "—"))
      .catch(() => {});
  }, [portalKey]);

  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm"
      style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}
    >
      <span style={{ color: "var(--muted)" }}>
        {deviceKind === "mag" ? "MAG" : "Enigma2"} portal URL (enter on box):
      </span>{" "}
      <code className="font-mono" style={{ color: "var(--accent)" }}>
        {portalUrl}
      </code>
      {settingsHref && (
        <>
          {" "}
          <Link href={settingsHref} className="text-xs underline" style={{ color: "var(--muted)" }}>
            Edit in settings
          </Link>
        </>
      )}
    </div>
  );
}
