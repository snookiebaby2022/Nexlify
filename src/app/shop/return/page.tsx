"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ShopReturnInner() {
  const search = useSearchParams();
  const [msg, setMsg] = useState("Confirming payment…");
  const [created, setCreated] = useState<{
    username: string;
    password: string;
    portal: string;
    m3u: string;
    webplayer: string;
  } | null>(null);

  useEffect(() => {
    const pendingId = search.get("pending") ?? "";
    const orderId = search.get("token") ?? search.get("orderId") ?? "";
    fetch("/api/shop/paypal/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingId, orderId }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Capture failed");
        setCreated({
          username: data.line.username,
          password: data.line.password,
          portal: data.portal,
          m3u: data.m3u,
          webplayer: data.webplayer,
        });
      })
      .catch((e) => setMsg(e instanceof Error ? e.message : "Payment failed"));
  }, [search]);

  return (
    <div className="min-h-screen text-white p-6" style={{ background: "#0a1628" }}>
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">Payment</h1>
        {created ? (
          <div className="rounded-xl border p-4 space-y-2 text-sm" style={{ borderColor: "#1e3a5f" }}>
            <p>Paid. Line created.</p>
            <p>
              Username: <code>{created.username}</code>
            </p>
            <p>
              Password: <code>{created.password}</code>
            </p>
            <p>
              <a href={created.m3u} style={{ color: "#22d3ee" }}>
                Download M3U
              </a>
            </p>
            <p>
              <a href={created.webplayer} style={{ color: "#22d3ee" }}>
                Watch in browser
              </a>
            </p>
            <p>
              <Link href="/portal" style={{ color: "#22d3ee" }}>
                Subscriber portal
              </Link>
            </p>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "#94a3b8" }}>
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ShopReturnPage() {
  return (
    <Suspense fallback={<p className="p-6 text-white">Loading…</p>}>
      <ShopReturnInner />
    </Suspense>
  );
}
