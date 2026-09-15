"use client";

import { useEffect, useState } from "react";

export function ImpersonationBanner() {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/impersonate")
      .then((r) => r.json())
      .then((d) => {
        if (d.impersonating) setUsername(String(d.username ?? "reseller"));
      })
      .catch(() => {});
  }, []);

  if (!username) return null;

  return (
    <div
      className="px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2"
      style={{ background: "rgba(251,191,36,0.16)", color: "#fbbf24" }}
    >
      <span>
        Viewing as <strong>{username}</strong>. Changes apply to this reseller account.
      </span>
      <button
        type="button"
        className="underline"
        onClick={() => {
          void fetch("/api/admin/impersonate", { method: "DELETE" }).then((r) =>
            r.json().then((d) => {
              const dest = String(d.redirect || "/admin/dashboard");
              window.location.href =
                dest.startsWith("/") && !dest.startsWith("//") ? dest : "/admin/dashboard";
            })
          );
        }}
      >
        Return to admin
      </button>
    </div>
  );
}
