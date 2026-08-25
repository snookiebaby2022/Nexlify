"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ShopPkg = {
  id: string;
  name: string;
  description: string | null;
  days: number;
  shopPriceCents: number;
  maxLines: number;
};

export default function ShopPage() {
  const [packages, setPackages] = useState<ShopPkg[]>([]);
  const [packageId, setPackageId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [created, setCreated] = useState<{
    username: string;
    password: string;
    portal: string;
    m3u: string;
    webplayer: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/shop/packages")
      .then((r) => r.json())
      .then((d) => {
        const list = d.packages ?? [];
        setPackages(list);
        if (list[0]) setPackageId(list[0].id);
      });
  }, []);

  async function buy(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/shop/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId, username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Checkout failed");
      return;
    }
    if (data.approveUrl) {
      window.location.href = data.approveUrl;
      return;
    }
    setCreated({
      username: data.line.username,
      password: data.line.password,
      portal: data.portal,
      m3u: data.m3u,
      webplayer: data.webplayer,
    });
  }

  return (
    <div className="min-h-screen text-white p-6" style={{ background: "#0a1628" }}>
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-2xl font-semibold">Subscribe</h1>
        <p className="text-sm" style={{ color: "#94a3b8" }}>
          Pick a package. You get a line, M3U, MAG portal, and a web player.
        </p>
        {!packages.length ? (
          <p className="text-sm" style={{ color: "#94a3b8" }}>
            No shop packages yet. Enable “List on public /shop” on a package in the panel.
          </p>
        ) : created ? (
          <div className="rounded-xl border p-4 space-y-2 text-sm" style={{ borderColor: "#1e3a5f" }}>
            <p>Line created.</p>
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
                Subscriber portal (password / MAG)
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={buy} className="space-y-3 rounded-xl border p-4" style={{ borderColor: "#1e3a5f" }}>
            <label className="block text-sm">
              Package
              <select
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
                style={{ borderColor: "#1e3a5f" }}
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
              >
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.days}d · {(p.shopPriceCents / 100).toFixed(2)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Username
              <input
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
                style={{ borderColor: "#1e3a5f" }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="optional — auto if empty"
              />
            </label>
            <label className="block text-sm">
              Password
              <input
                className="mt-1 w-full rounded border px-3 py-2 bg-transparent"
                style={{ borderColor: "#1e3a5f" }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="optional — auto if empty"
              />
            </label>
            {msg && <p className="text-sm text-red-400">{msg}</p>}
            <button type="submit" className="rounded px-4 py-2 text-sm font-medium" style={{ background: "#22d3ee", color: "#0a1628" }}>
              Pay and create line
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
