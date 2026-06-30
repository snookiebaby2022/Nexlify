"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Monitor, Radio, Tv } from "lucide-react";

type Summary = {
  mag: { total: number; active: number };
  enigma: { total: number; active: number };
  recentMag: { id: string; mac: string; model: string | null; isActive: boolean; line: { username: string; status: string } }[];
  recentEnigma: { id: string; mac: string; model: string | null; isActive: boolean; line: { username: string; status: string } }[];
  stbEvents: { id: string; deviceType: string; mac: string | null; event: string; createdAt: string }[];
  portalUrls: { magServerUrl: string; enigmaServerUrl: string; stalkerPortal: string };
};

export default function DeviceCenterPage() {
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    fetch("/api/admin/devices/summary")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading device center…</p>;
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg"
        style={{ background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 100%)" }}
      >
        <div>
          <p className="text-xs text-white/80">STB management</p>
          <h1 className="text-lg font-semibold text-white">MAG & Enigma2 Center</h1>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Tv size={20} style={{ color: "var(--accent)" }} />
            <h2 className="font-semibold">MAG devices</h2>
          </div>
          <p className="text-3xl font-bold tabular-nums">{data.mag.active}<span className="text-lg font-normal text-neutral-500"> / {data.mag.total}</span></p>
          <p className="text-xs mt-1 mb-3" style={{ color: "var(--muted)" }}>Active / total</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/mag/add" className="text-xs px-3 py-1.5 rounded btn-positive">Add MAG</Link>
            <Link href="/admin/mag/bulk" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Bulk add</Link>
            <Link href="/admin/mag" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Manage</Link>
            <Link href="/admin/mag_events" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Events</Link>
          </div>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Monitor size={20} style={{ color: "var(--accent)" }} />
            <h2 className="font-semibold">Enigma2 devices</h2>
          </div>
          <p className="text-3xl font-bold tabular-nums">{data.enigma.active}<span className="text-lg font-normal text-neutral-500"> / {data.enigma.total}</span></p>
          <p className="text-xs mt-1 mb-3" style={{ color: "var(--muted)" }}>Active / total</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/enigmas/add" className="text-xs px-3 py-1.5 rounded btn-positive">Add Enigma2</Link>
            <Link href="/admin/enigmas/bulk" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Bulk add</Link>
            <Link href="/admin/enigmas" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Manage</Link>
            <Link href="/admin/mag_events" className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>Events</Link>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4 text-sm space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <h2 className="font-semibold flex items-center gap-2"><Radio size={16} /> Portal URLs (configure in Settings → Server)</h2>
        <p><span style={{ color: "var(--muted)" }}>MAG portal:</span> {data.portalUrls.magServerUrl || "— set server URL"}</p>
        <p><span style={{ color: "var(--muted)" }}>Enigma2 portal:</span> {data.portalUrls.enigmaServerUrl || "— set server URL"}</p>
        <p><span style={{ color: "var(--muted)" }}>Stalker API:</span> {typeof window !== "undefined" ? `${window.location.origin}${data.portalUrls.stalkerPortal}` : data.portalUrls.stalkerPortal}</p>
        <Link href="/admin/settings/server" className="text-xs underline" style={{ color: "var(--accent)" }}>Edit server URLs →</Link>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <DeviceTable title="Recent MAG" rows={data.recentMag} editPrefix="/admin/mag" />
        <DeviceTable title="Recent Enigma2" rows={data.recentEnigma} editPrefix="/admin/enigmas" />
      </div>

      {data.stbEvents.length > 0 && (
        <section className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold px-4 py-3" style={{ background: "rgba(0,192,239,0.1)" }}>Recent STB events</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">MAC</th>
                <th className="px-3 py-2 text-left">Event</th>
              </tr>
            </thead>
            <tbody>
              {data.stbEvents.map((e) => (
                <tr key={e.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{e.deviceType}</td>
                  <td className="px-3 py-2 font-mono">{e.mac ?? "—"}</td>
                  <td className="px-3 py-2">{e.event}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function DeviceTable({
  title,
  rows,
  editPrefix,
}: {
  title: string;
  rows: Summary["recentMag"];
  editPrefix: string;
}) {
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <h2 className="text-sm font-semibold px-3 py-2" style={{ background: "rgba(0,192,239,0.08)" }}>{title}</h2>
      {rows.length === 0 ? (
        <p className="p-4 text-xs" style={{ color: "var(--muted)" }}>No devices yet.</p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2 font-mono">{d.mac}</td>
                <td className="px-3 py-2">{d.line.username}</td>
                <td className="px-3 py-2">{d.isActive ? "Active" : "Off"}</td>
                <td className="px-3 py-2 text-right">
                  <Link href={`${editPrefix}/${d.id}/edit`} className="underline" style={{ color: "var(--accent)" }}>Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
