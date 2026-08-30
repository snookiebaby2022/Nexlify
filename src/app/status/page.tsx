"use client";

import { useEffect, useState } from "react";

type Lb = { id: string; name: string; online: boolean; health: string };

export default function PublicLbStatusPage() {
  const [lbs, setLbs] = useState<Lb[]>([]);
  const [meta, setMeta] = useState({ online: 0, total: 0, generatedAt: "" });

  useEffect(() => {
    function load() {
      fetch("/api/public/lb-status", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          setLbs(Array.isArray(d.loadBalancers) ? d.loadBalancers : []);
          setMeta({
            online: Number(d.online ?? 0),
            total: Number(d.total ?? 0),
            generatedAt: d.generatedAt ?? "",
          });
        })
        .catch(() => setLbs([]));
    }
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="min-h-screen px-6 py-12 max-w-3xl mx-auto" style={{ color: "#e2e8f0", background: "#0b1220" }}>
      <h1 className="text-2xl font-bold">Nexlify load balancer status</h1>
      <p className="text-sm mt-2 opacity-70">
        Public page — load balancers only. Main panel server is not listed.
      </p>
      <p className="text-sm mt-4">
        {meta.online} / {meta.total} LBs online
        {meta.generatedAt ? ` · ${new Date(meta.generatedAt).toLocaleString()}` : ""}
      </p>
      <ul className="mt-6 space-y-2">
        {lbs.map((s) => (
          <li
            key={s.id}
            className="rounded-lg border px-4 py-3 flex justify-between"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          >
            <span>{s.name}</span>
            <span style={{ color: s.online ? "#4ade80" : "#f87171" }}>{s.online ? "Online" : s.health || "Offline"}</span>
          </li>
        ))}
        {!lbs.length ? <li className="opacity-60">No load balancers detected.</li> : null}
      </ul>
    </main>
  );
}
