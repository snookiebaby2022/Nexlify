"use client";



import { useEffect, useState } from "react";

import { MessageCircle } from "lucide-react";



export function SettingsCommunityLinks() {

  const [links, setLinks] = useState({ telegramUrl: "", discordUrl: "", signalUrl: "" });



  useEffect(() => {

    fetch("/api/admin/settings?group=community")

      .then((r) => r.json())

      .then((d) => {

        setLinks({

          telegramUrl: String(d.settings?.telegramUrl ?? ""),

          discordUrl: String(d.settings?.discordUrl ?? ""),

          signalUrl: String(d.settings?.signalUrl ?? ""),

        });

      });

  }, []);



  if (!links.telegramUrl && !links.discordUrl && !links.signalUrl) {

    return (

      <div className="mt-3 pt-3 border-t px-3 pb-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>

        Add Telegram, Discord, or Signal under Community & chat.

      </div>

    );

  }



  return (

    <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: "var(--border)" }}>

      <div className="px-2 text-xs font-medium flex items-center gap-1" style={{ color: "var(--muted)" }}>

        <MessageCircle size={12} />

        Community

      </div>

      {links.telegramUrl && (

        <a

          href={links.telegramUrl}

          target="_blank"

          rel="noreferrer"

          className="block px-3 py-1.5 rounded text-xs hover:opacity-90"

          style={{ color: "#29b6f6" }}

        >

          Telegram

        </a>

      )}

      {links.discordUrl && (

        <a

          href={links.discordUrl}

          target="_blank"

          rel="noreferrer"

          className="block px-3 py-1.5 rounded text-xs hover:opacity-90"

          style={{ color: "#5865f2" }}

        >

          Discord

        </a>

      )}

      {links.signalUrl && (

        <a

          href={links.signalUrl}

          target="_blank"

          rel="noreferrer"

          className="block px-3 py-1.5 rounded text-xs hover:opacity-90"

          style={{ color: "#3b82f6" }}

        >

          Signal group

        </a>

      )}

    </div>

  );

}


