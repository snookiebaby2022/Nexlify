"use client";

import { useCallback, useEffect, useState } from "react";

export function PanelSidebarVersion({ variant = "main" }: { variant?: "main" | "settings" }) {
  const [version, setVersion] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/panel/version", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setVersion(d?.version ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const onUpdated = () => load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("nexlify-panel-updated", onUpdated);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    const poll = window.setInterval(load, 30_000);
    return () => {
      window.removeEventListener("nexlify-panel-updated", onUpdated);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(poll);
    };
  }, [load]);

  const className = variant === "settings" ? "settings-sidebar-version" : "panel-sidebar-version";
  const display = version ?? "—";

  return (
    <div className={className} title="Installed panel version">
      <span className="panel-sidebar-version-label">Installed</span>{" "}
      <span className="panel-sidebar-version-num">v{display}</span>
    </div>
  );
}
