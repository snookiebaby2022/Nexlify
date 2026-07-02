"use client";

import { useEffect, useState } from "react";

export function PanelCommunityBar() {
  const [links, setLinks] = useState({ telegramUrl: "", discordUrl: "", signalUrl: "" });

  useEffect(() => {
    fetch("/api/public/community-links")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setLinks({
          telegramUrl: String(d.telegramUrl ?? ""),
          discordUrl: String(d.discordUrl ?? ""),
          signalUrl: String(d.signalUrl ?? ""),
        });
      })
      .catch(() => {});
  }, []);

  if (!links.telegramUrl && !links.discordUrl && !links.signalUrl) return null;

  return (
    <div
      className="hidden md:flex items-center gap-3 px-4 py-1.5 text-xs border-t"
      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
    >
      {links.telegramUrl && (
        <a href={links.telegramUrl} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: "#29b6f6" }}>
          Telegram
        </a>
      )}
      {links.discordUrl && (
        <a href={links.discordUrl} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: "#5865f2" }}>
          Discord
        </a>
      )}
      {links.signalUrl && (
        <a href={links.signalUrl} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: "#3b82f6" }}>
          Signal
        </a>
      )}
    </div>
  );
}
