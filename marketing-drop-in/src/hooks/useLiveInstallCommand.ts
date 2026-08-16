"use client";

import { useEffect, useState } from "react";
import {
  INSTALLER_VERSION,
  installerPanelShUrl,
  oneClickInstallExample,
} from "@/lib/panel-install";

export type LiveInstallCommand = {
  command: string;
  url: string;
  label: string;
  version: string;
};

const FALLBACK: LiveInstallCommand = {
  command: oneClickInstallExample,
  url: installerPanelShUrl,
  label: INSTALLER_VERSION,
  version: INSTALLER_VERSION.replace(/^v/, ""),
};

/** Prefer runtime JSON/API so stale .next bundles cannot show wrong ?v1.9.7 URLs. */
export function useLiveInstallCommand(): LiveInstallCommand {
  const [data, setData] = useState<LiveInstallCommand>(FALLBACK);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      for (const endpoint of ["/api/install-command", "/install-command.json"]) {
        try {
          const res = await fetch(endpoint, { cache: "no-store" });
          if (!res.ok) continue;
          const d = (await res.json()) as Partial<LiveInstallCommand> & { version?: string };
          const url = d.url?.trim();
          const command = d.command?.trim();
          if (!url?.includes("?v=") || !command?.includes("?v=")) continue;
          if (cancelled) return;
          setData({
            command,
            url,
            label: d.label?.trim() || `v${d.version || ""}`,
            version: String(d.version || d.label?.replace(/^v/, "") || ""),
          });
          return;
        } catch {
          /* try next source */
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
