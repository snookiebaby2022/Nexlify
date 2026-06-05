"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { countryNameForCode } from "@/lib/free-proxies";
import { IpWithFlag } from "@/components/ip-with-flag";

type ProxyRow = {
  id: string;
  name: string;
  host: string;
  port: number;
  type: string;
  username: string | null;
  country: string | null;
  isActive: boolean;
  isFreeTier: boolean;
  _count: { servers: number };
};

type FreeProxy = {
  host: string;
  port: number;
  type: string;
  country: string;
  countryName: string;
};

export default function AdminProxiesPage() {
  const [proxies, setProxies] = useState<ProxyRow[]>([]);
  const [freeProxies, setFreeProxies] = useState<FreeProxy[]>([]);
  const [freeSource, setFreeSource] = useState<string>("");
  const [freeDisclaimer, setFreeDisclaimer] = useState("");
  const [freeCountry, setFreeCountry] = useState("all");
  const [freeBusy, setFreeBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    host: "",
    port: 8080,
    type: "HTTP",
    username: "",
    password: "",
    country: "",
  });

  function load() {
    fetch("/api/admin/proxies")
      .then((r) => r.json())
      .then((d) => setProxies(d.proxies ?? []));
  }

  function loadFree() {
    const q = freeCountry === "all" ? "" : `?country=${freeCountry}`;
    fetch(`/api/admin/proxies/free${q}`)
      .then((r) => r.json())
      .then((d) => {
        setFreeProxies(d.proxies ?? []);
        setFreeSource(d.source ?? "");
        setFreeDisclaimer(d.disclaimer ?? "");
      });
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadFree();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when country filter changes
  }, [freeCountry]);

  const freeCountries = useMemo(() => {
    const codes = new Set(freeProxies.map((p) => p.country).filter((c) => c && c !== "ww"));
    return [...codes].sort();
  }, [freeProxies]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/proxies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        username: form.username || null,
        password: form.password || null,
        country: form.country || null,
      }),
    });
    setForm({
      name: "",
      host: "",
      port: 8080,
      type: "HTTP",
      username: "",
      password: "",
      country: "",
    });
    load();
  }

  async function addFreeProxy(p: FreeProxy) {
    const key = `${p.host}:${p.port}`;
    setFreeBusy(key);
    await fetch("/api/admin/proxies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `FREE ${p.countryName} ${p.host}`,
        host: p.host,
        port: p.port,
        type: p.type,
        country: p.country === "ww" ? null : p.country,
        isFreeTier: true,
        isActive: true,
      }),
    });
    setFreeBusy(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this proxy? Servers using it will be unlinked.")) return;
    await fetch(`/api/admin/proxies?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "#00c0ef" }}>
          Stream proxies
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          HTTP/HTTPS/SOCKS5 proxies for EPG fetch and outbound panel traffic. Assign per server under Manage Servers.
        </p>
      </div>

      <section
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#00c0ef" }}>
          Free proxy list
        </h2>
        {freeDisclaimer && (
          <p className="text-xs rounded px-2 py-1" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
            {freeDisclaimer}
          </p>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="rounded border px-3 py-2 text-sm bg-white text-black"
            style={{ borderColor: "var(--border)" }}
            value={freeCountry}
            onChange={(e) => setFreeCountry(e.target.value)}
          >
            <option value="all">All countries</option>
            {freeCountries.map((c) => (
              <option key={c} value={c}>
                {countryNameForCode(c)}
              </option>
            ))}
          </select>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Source: {freeSource || "—"} · {freeProxies.length} listed
          </span>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded cursor-pointer ml-auto"
            style={{ background: "#3c8dbc", color: "#fff" }}
            onClick={loadFree}
          >
            Refresh list
          </button>
        </div>
        <div className="overflow-auto max-h-48 rounded border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "rgba(0,192,239,0.08)" }}>
                <th className="text-left p-2">Endpoint</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Country</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {freeProxies.slice(0, 50).map((p) => {
                const key = `${p.host}:${p.port}`;
                return (
                  <tr key={key} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="p-2">
                      <IpWithFlag
                        ip={`${p.host}:${p.port}`}
                        countryCode={p.country && p.country !== "ww" ? p.country : null}
                      />
                    </td>
                    <td className="p-2">{p.type}</td>
                    <td className="p-2">{p.countryName}</td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        disabled={freeBusy === key}
                        onClick={() => addFreeProxy(p)}
                        className="text-xs px-2 py-1 rounded cursor-pointer disabled:opacity-50"
                        style={{ background: "#00a65a", color: "#fff" }}
                      >
                        {freeBusy === key ? "Adding…" : "Add to pool"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <form
        id="add-proxy"
        onSubmit={add}
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#00c0ef" }}>
          Add proxy
        </h2>
        <div className="grid md:grid-cols-4 gap-3">
        <input
          placeholder="Name"
          className="rounded border px-3 py-2 bg-white text-black"
          style={{ borderColor: "var(--border)" }}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          placeholder="Host"
          className="rounded border px-3 py-2 bg-white text-black"
          style={{ borderColor: "var(--border)" }}
          value={form.host}
          onChange={(e) => setForm({ ...form, host: e.target.value })}
          required
        />
        <input
          type="number"
          placeholder="Port"
          className="rounded border px-3 py-2 bg-white text-black"
          style={{ borderColor: "var(--border)" }}
          value={form.port}
          onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) })}
        />
        <select
          className="rounded border px-3 py-2 bg-white text-black"
          style={{ borderColor: "var(--border)" }}
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          <option value="HTTP">HTTP</option>
          <option value="HTTPS">HTTPS</option>
          <option value="SOCKS5">SOCKS5</option>
        </select>
        <input
          placeholder="Username (optional)"
          className="rounded border px-3 py-2 bg-white text-black"
          style={{ borderColor: "var(--border)" }}
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />
        <input
          type="password"
          placeholder="Password (optional)"
          className="rounded border px-3 py-2 bg-white text-black"
          style={{ borderColor: "var(--border)" }}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <input
          placeholder="Country code (e.g. us)"
          className="rounded border px-3 py-2 bg-white text-black"
          style={{ borderColor: "var(--border)" }}
          value={form.country}
          onChange={(e) => setForm({ ...form, country: e.target.value })}
        />
        <button
          type="submit"
          className="rounded py-2 font-medium cursor-pointer md:col-span-4"
          style={{ background: "#00a65a", color: "#fff" }}
        >
          Add proxy
        </button>
        </div>
      </form>

      <DataTable
        headers={["Name", "Endpoint", "Type", "Country", "Tier", "Servers", ""]}
        rows={proxies.map((p) => [
          p.name,
          <IpWithFlag key={`ep-${p.id}`} ip={`${p.host}:${p.port}`} countryCode={p.country} />,
          p.type,
          p.country ?? "—",
          p.isFreeTier ? (
            <span className="text-xs px-1 rounded" style={{ background: "rgba(34,197,94,0.2)", color: "#4ade80" }}>
              Free
            </span>
          ) : (
            "Paid"
          ),
          p._count.servers,
          <button
            key={p.id}
            type="button"
            className="text-xs cursor-pointer"
            style={{ color: "var(--danger)" }}
            onClick={() => remove(p.id)}
          >
            Delete
          </button>,
        ])}
      />
    </div>
  );
}
