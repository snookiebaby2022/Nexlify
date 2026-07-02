"use client";



import { useEffect, useState } from "react";

import Link from "next/link";

import {

  LOCALE_STORAGE_KEY,

  normalizeLocale,

  t,

  type PanelLocale,

} from "@/lib/i18n/panel-i18n";



type PortalInfo = {

  line: {

    username: string;

    status: string;

    expiresAt: string;

    maxConnections: number;

    playable: boolean;

    bouquets: string[];

  };

  endpoints: { m3u: string; m3uDownload: string; xtream: string; epg: string; stalker: string };

  billing: {

    renewUrl: string | null;

    topUpUrl: string | null;

    stripeCheckoutUrl: string | null;

    couponEnabled: boolean;

  };

  support: { ticketUrl: string; createTicketUrl: string };

};



function CopyField({ label, value }: { label: string; value: string }) {

  return (

    <div className="text-sm space-y-1">

      <div style={{ color: "#94a3b8" }}>{label}</div>

      <div className="flex gap-2">

        <code

          className="flex-1 rounded border px-2 py-1.5 text-xs break-all"

          style={{ borderColor: "#1e3a5f", color: "#e2e8f0" }}

        >

          {value}

        </code>

        <button

          type="button"

          className="shrink-0 rounded px-2 text-xs border cursor-pointer"

          style={{ borderColor: "#1e3a5f", color: "#22d3ee" }}

          onClick={() => navigator.clipboard.writeText(value)}

        >

          Copy

        </button>

      </div>

    </div>

  );

}



export default function PortalDashboardPage() {

  const [info, setInfo] = useState<PortalInfo | null>(null);

  const [error, setError] = useState("");

  const [locale, setLocale] = useState<PanelLocale>("en");



  useEffect(() => {

    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);

    setLocale(normalizeLocale(stored));

  }, []);



  useEffect(() => {

    fetch("/api/portal/info")

      .then((r) => {

        if (r.status === 401) {

          window.location.href = "/portal";

          return null;

        }

        return r.json();

      })

      .then((d) => {

        if (!d) return;

        if (d.error) setError(d.error);

        else setInfo(d);

      });

  }, []);



  async function logout() {

    await fetch("/api/portal/login", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ action: "logout" }),

    });

    window.location.href = "/portal";

  }



  if (error) {

    return (

      <div className="min-h-screen p-8 text-white" style={{ background: "#0a1628" }}>

        {error}

      </div>

    );

  }



  if (!info) {

    return (

      <div className="min-h-screen p-8 text-white" style={{ background: "#0a1628" }}>

        {t(locale, "loading")}

      </div>

    );

  }



  const exp = new Date(info.line.expiresAt).toLocaleDateString();



  return (

    <div className="min-h-screen text-white" style={{ background: "#0a1628" }}>

      <header

        className="border-b px-6 py-4 flex flex-wrap items-center justify-between gap-3"

        style={{ borderColor: "#1e3a5f", background: "#111b2e" }}

      >

        <div>

          <h1 className="text-xl font-semibold">{t(locale, "mySubscription")}</h1>

          <p className="text-sm" style={{ color: "#94a3b8" }}>

            {info.line.username}

          </p>

        </div>

        <div className="flex flex-wrap gap-2">

          <Link

            href="/portal/devices"

            className="rounded px-3 py-1.5 text-sm border"

            style={{ borderColor: "#1e3a5f", color: "#94a3b8" }}

          >

            Devices & password

          </Link>

          <Link

            href="/portal/setup"

            className="rounded px-3 py-1.5 text-sm border"

            style={{ borderColor: "#22d3ee", color: "#22d3ee" }}

          >

            {t(locale, "playerSetup")}

          </Link>

          <button

            type="button"

            onClick={logout}

            className="rounded px-3 py-1.5 text-sm border cursor-pointer"

            style={{ borderColor: "#1e3a5f", color: "#94a3b8" }}

          >

            {t(locale, "logout")}

          </button>

        </div>

      </header>



      <main className="max-w-3xl mx-auto p-6 space-y-6">

        <section

          className="rounded-xl border p-5 grid sm:grid-cols-2 gap-4"

          style={{ borderColor: "#1e3a5f", background: "#111b2e" }}

        >

          <div>

            <div className="text-xs uppercase tracking-wide" style={{ color: "#64748b" }}>

              {t(locale, "status")}

            </div>

            <div className="text-lg font-medium">{info.line.status}</div>

          </div>

          <div>

            <div className="text-xs uppercase tracking-wide" style={{ color: "#64748b" }}>

              {t(locale, "expires")}

            </div>

            <div className="text-lg font-medium">{exp}</div>

          </div>

          <div>

            <div className="text-xs uppercase tracking-wide" style={{ color: "#64748b" }}>

              {t(locale, "maxDevices")}

            </div>

            <div className="text-lg font-medium">{info.line.maxConnections}</div>

          </div>

          <div>

            <div className="text-xs uppercase tracking-wide" style={{ color: "#64748b" }}>

              {t(locale, "bouquets")}

            </div>

            <div className="text-sm">{info.line.bouquets.join(", ") || "—"}</div>

          </div>

        </section>



        {(info.billing.renewUrl || info.billing.stripeCheckoutUrl) && (

          <section

            className="rounded-xl border p-5 flex flex-wrap gap-3"

            style={{ borderColor: "#1e3a5f", background: "#111b2e" }}

          >

            {info.billing.renewUrl && (

              <a

                href={info.billing.renewUrl}

                target="_blank"

                rel="noopener noreferrer"

                className="rounded px-4 py-2 text-sm font-medium"

                style={{ background: "#22d3ee", color: "#0a1628" }}

              >

                {t(locale, "renew")}

              </a>

            )}

            {info.billing.topUpUrl && (

              <a

                href={info.billing.topUpUrl}

                target="_blank"

                rel="noopener noreferrer"

                className="rounded px-4 py-2 text-sm border"

                style={{ borderColor: "#22d3ee", color: "#22d3ee" }}

              >

                {t(locale, "topUp")}

              </a>

            )}

          </section>

        )}



        <section className="rounded-xl border p-5 space-y-4" style={{ borderColor: "#1e3a5f", background: "#111b2e" }}>

          <h2 className="font-semibold">{t(locale, "playlistUrls")}</h2>

          <CopyField label="M3U playlist" value={info.endpoints.m3u} />

          <div className="flex flex-wrap gap-2">

            <a

              href={info.endpoints.m3uDownload}

              className="rounded px-3 py-1.5 text-sm border"

              style={{ borderColor: "#22d3ee", color: "#22d3ee" }}

            >

              {t(locale, "downloadM3u")}

            </a>

            <a

              href={info.endpoints.epg}

              target="_blank"

              rel="noopener noreferrer"

              className="rounded px-3 py-1.5 text-sm border"

              style={{ borderColor: "#1e3a5f", color: "#94a3b8" }}

            >

              {t(locale, "epgGuide")}

            </a>

          </div>

          <CopyField label="Xtream API" value={info.endpoints.xtream} />

          <CopyField label="EPG" value={info.endpoints.epg} />

        </section>



        <section className="rounded-xl border p-5" style={{ borderColor: "#1e3a5f", background: "#111b2e" }}>

          <h2 className="font-semibold mb-2">{t(locale, "support")}</h2>

          <p className="text-sm mb-3" style={{ color: "#94a3b8" }}>

            Need help with your subscription or device setup?

          </p>

          <Link href={info.support.createTicketUrl} className="underline mr-4" style={{ color: "#22d3ee" }}>

            {t(locale, "createTicket")}

          </Link>

          <Link href={info.support.ticketUrl} className="underline" style={{ color: "#22d3ee" }}>

            {t(locale, "support")}

          </Link>

        </section>

      </main>

    </div>

  );

}

