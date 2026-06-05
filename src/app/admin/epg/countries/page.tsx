"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EPG_WORKING_LINKS } from "@/lib/epg-working-links";

type CountryRow = {
  code: string;
  name: string;
  url: string;
  imported: boolean;
  programs: number;
  lastSync: string | null;
};

export default function AdminEpgCountriesPage() {
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");

  function load() {
    fetch("/api/admin/epg/countries")
      .then((r) => r.json())
      .then((d) => {
        setCountries(d.countries ?? []);
        setTotal(d.total ?? 0);
      });
  }

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(
    () =>
      countries.filter(
        (c) =>
          !filter ||
          c.name.toLowerCase().includes(filter.toLowerCase()) ||
          c.code.toLowerCase().includes(filter.toLowerCase())
      ),
    [countries, filter]
  );

  const importedCount = countries.filter((c) => c.imported).length;

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function selectAllShown() {
    setSelected(new Set(shown.map((c) => c.code)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function runAction(
    mode: "import" | "sync" | "force",
    opts?: { all?: boolean }
  ) {
    const codes = opts?.all ? undefined : Array.from(selected);
    if (!opts?.all && (!codes || codes.length === 0)) {
      setMsg("Select at least one country.");
      return;
    }
    setBusy(mode);
    setMsg("");
    const res = await fetch("/api/admin/epg/countries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        all: opts?.all,
        codes,
        sync: mode === "sync" || mode === "force",
        forceSync: mode === "force",
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error ?? "Request failed");
      return;
    }
    setMsg(
      `Added ${data.added ?? 0} source(s), synced ${data.synced ?? 0}` +
        (data.errors?.length ? ` · ${data.errors.length} error(s)` : "")
    );
    load();
  }

  async function forceSyncAllImported() {
    setBusy("force-all");
    setMsg("");
    const res = await fetch("/api/admin/epg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncAll: true }),
    });
    const data = await res.json();
    setBusy(null);
    setMsg(
      res.ok
        ? `Force synced ${data.synced ?? 0} / ${data.total ?? 0} active source(s)`
        : data.error ?? "Sync failed"
    );
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">EPG — all countries</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {importedCount} / {total} iptv-org country guides registered · {selected.size} selected
          </p>
        </div>
        <Link href="/admin/epg/sources" className="text-sm" style={{ color: "var(--accent)" }}>
          EPG sources →
        </Link>
      </div>

      {msg && (
        <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--border)" }}>
          {msg}
        </p>
      )}

      <section
        className="rounded-lg border p-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <h2 className="text-sm font-semibold mb-2" style={{ color: "#00c0ef" }}>
          Working EPG links
        </h2>
        <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
          Public iptv-org XMLTV guides. Use <strong>Import selected</strong> on a country below, or add a custom source
          with one of these URLs under Add EPG.
        </p>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          {EPG_WORKING_LINKS.map((link) => (
            <li key={link.code}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded border px-3 py-2 hover:opacity-90"
                style={{ borderColor: "var(--border)", color: "var(--accent)" }}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          className="rounded px-3 py-2 text-sm cursor-pointer disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
          onClick={() => runAction("import", { all: true })}
        >
          {busy === "import" ? "Importing all countries…" : "Import all countries"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          className="rounded px-3 py-2 text-sm cursor-pointer disabled:opacity-50"
          style={{ background: "#00a65a", color: "#fff" }}
          onClick={async () => {
            setBusy("import-sync-all");
            setMsg("");
            const res = await fetch("/api/admin/epg/countries", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ all: true, sync: true }),
            });
            const data = await res.json();
            setBusy(null);
            setMsg(
              res.ok
                ? `Imported ${data.added ?? 0} countries, synced ${data.synced ?? 0}` +
                    (data.errors?.length ? ` · ${data.errors.length} errors` : "")
                : data.error ?? "Failed"
            );
            load();
          }}
        >
          {busy === "import-sync-all" ? "Working…" : "Import + sync all countries"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          className="rounded px-3 py-2 text-sm border cursor-pointer disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
          onClick={() => runAction("import", { all: false })}
        >
          Import selected
        </button>
        <button
          type="button"
          disabled={!!busy}
          className="rounded px-3 py-2 text-sm border cursor-pointer disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
          onClick={() => runAction("sync", { all: false })}
        >
          Sync selected
        </button>
        <button
          type="button"
          disabled={!!busy}
          className="rounded px-3 py-2 text-sm border cursor-pointer disabled:opacity-50"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
          onClick={() => runAction("force", { all: false })}
        >
          {busy === "force" ? "Force syncing…" : "Force sync selected"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          className="rounded px-3 py-2 text-sm cursor-pointer disabled:opacity-50"
          style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.4)" }}
          onClick={forceSyncAllImported}
        >
          {busy === "force-all" ? "Syncing all…" : "Force sync all imported"}
        </button>
        <button type="button" className="text-sm px-2 py-2 cursor-pointer" onClick={selectAllShown}>
          Select visible
        </button>
        <button type="button" className="text-sm px-2 py-2 cursor-pointer" onClick={clearSelection}>
          Clear
        </button>
        <input
          placeholder="Filter country…"
          className="rounded border px-3 py-2 text-sm bg-transparent ml-auto"
          style={{ borderColor: "var(--border)" }}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div
        className="rounded-lg border overflow-auto max-h-[70vh]"
        style={{ borderColor: "var(--border)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              <th className="p-3 w-10" />
              <th className="text-left p-3">Code</th>
              <th className="text-left p-3">Country</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Programs</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.code} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(c.code)}
                    onChange={() => toggle(c.code)}
                  />
                </td>
                <td className="p-3 font-mono">{c.code}</td>
                <td className="p-3">{c.name}</td>
                <td className="p-3" style={{ color: "var(--muted)" }}>
                  {c.imported
                    ? c.lastSync
                      ? `Synced ${new Date(c.lastSync).toLocaleString()}`
                      : "Imported"
                    : "Not imported"}
                </td>
                <td className="p-3 text-right">{c.programs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
