"use client";

import Link from "next/link";
import { PANEL_HTTP_PORT, STREAM_EDGE_HTTP_PORT, STREAM_HTTPS_PORT } from "@/lib/server-ports";

const PORT_NOTES: {
  port: string;
  role: string;
  ok: boolean;
  note: string;
}[] = [
  {
    port: "80",
    role: "Panel / Xtream (direct IP)",
    ok: true,
    note: "Recommended for IP-based installs. Panel and player_api can share :80 when nginx is not in front.",
  },
  {
    port: String(STREAM_EDGE_HTTP_PORT),
    role: "IPTV stream edge",
    ok: true,
    note: "Dedicated HTTP edge for /live|/movie|/series and M3U clients. Prefer this for player traffic.",
  },
  {
    port: String(STREAM_HTTPS_PORT),
    role: "HTTPS / SSL",
    ok: true,
    note: "Use with a domain + cert. Panel HTTPS and stream HTTPS can share 443 behind nginx.",
  },
  {
    port: String(PANEL_HTTP_PORT),
    role: "Panel upstream (behind nginx)",
    ok: true,
    note: "Internal Node listen port when nginx terminates :80/:443. Do not advertise 13000 to end users.",
  },
  {
    port: "25461",
    role: "Legacy Xtream port",
    ok: true,
    note: "Optional compatibility port some apps still expect. Supported when the IPTV edge is bound to it.",
  },
  {
    port: "2095 / 2096",
    role: "XUI-era Cloudflare ports",
    ok: false,
    note: "Not used by Nexlify. Do not set these as the panel port — clients and firewall scripts will not open them by default.",
  },
  {
    port: "3000 / 3001",
    role: "Dev / internal only",
    ok: false,
    note: "Never expose as public panel URLs. Use 80/443 (or 8080 for streams) for clients.",
  },
];

export default function ServerCategoriesPortsPage() {
  return (
    <div className="space-y-4 max-w-3xl">
      <div
        className="flex items-center justify-between px-4 py-3 rounded-lg"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <h1 className="text-lg font-semibold text-white">Servers — ports</h1>
        <Link
          href="/admin/servers"
          className="text-sm px-4 py-1.5 rounded border border-white/70 text-white hover:bg-white/10"
        >
          Manage servers
        </Link>
      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Yes — each server can advertise different HTTP/HTTPS/panel ports (80, 8080, 443, etc.) when you add or edit it.
        The process must actually listen on that port (firewall + nginx/edge). Content categories live under{" "}
        <Link href="/admin/management/categories" className="underline" style={{ color: "var(--accent)" }}>
          Management → Categories
        </Link>
        .
      </p>

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "rgba(0,0,0,0.25)" }}>
            <tr>
              <th className="text-left px-3 py-2 font-normal">Port</th>
              <th className="text-left px-3 py-2 font-normal">Role</th>
              <th className="text-left px-3 py-2 font-normal">OK?</th>
              <th className="text-left px-3 py-2 font-normal">Notes</th>
            </tr>
          </thead>
          <tbody>
            {PORT_NOTES.map((row) => (
              <tr key={row.port} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2.5 font-mono tabular-nums">{row.port}</td>
                <td className="px-3 py-2.5">{row.role}</td>
                <td className="px-3 py-2.5">
                  <span className={`xui-pill xui-pill--${row.ok ? "yes" : "no"}`}>{row.ok ? "Yes" : "No"}</span>
                </td>
                <td className="px-3 py-2.5 text-xs" style={{ color: "var(--muted)" }}>
                  {row.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Set ports on{" "}
        <Link href="/admin/servers/add" className="underline" style={{ color: "var(--accent)" }}>
          Add Server
        </Link>{" "}
        or edit an existing server → Network / Advanced.
      </p>
    </div>
  );
}
