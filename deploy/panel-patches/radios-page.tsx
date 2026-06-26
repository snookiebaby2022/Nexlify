"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FREE_RADIO_STATIONS, type FreeRadioStation } from "@/lib/free-radio-stations";
import { DAB_RADIO_STATIONS } from "@/lib/dab-radio-stations";
import { RadioProbePlayer } from "@/components/radio-probe-player";

const ALL_RADIO_CATALOG = [...FREE_RADIO_STATIONS, ...DAB_RADIO_STATIONS];

type Stream = { id: string; name: string; streamUrl: string; isActive: boolean };

type Preview =
  | { kind: "catalog"; station: FreeRadioStation }
  | { kind: "stream"; stream: Stream };

function addStreamHref(station: FreeRadioStation) {
  const p = new URLSearchParams({
    name: station.name,
    source: station.streamUrl,
    radio: "1",
    from: "radios",
  });
  return `/admin/streams/add?${p.toString()}`;
}

export default function RadiosPage() {
  const router = useRouter();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [filter, setFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedStreams, setSelectedStreams] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);

  function load() {
    fetch("/api/admin/streams?radio=1")
      .then((r) => r.json())
      .then((d) => setStreams(d.streams ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  const freeShown = useMemo(() => {
    return ALL_RADIO_CATALOG.filter((s) => {
      if (countryFilter !== "all" && s.country !== countryFilter) return false;
      if (!filter) return true;
      const q = filter.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.countryName.toLowerCase().includes(q);
    });
  }, [filter, countryFilter]);

  const countries = useMemo(
    () => [...new Set(ALL_RADIO_CATALOG.map((s) => s.country))].sort(),
    []
  );

  const allCatalogSelected =
    freeShown.length > 0 && freeShown.every((s) => selected.has(s.id));

  function toggleCatalog(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAllCatalog() {
    if (allCatalogSelected) {
      const next = new Set(selected);
      freeShown.forEach((s) => next.delete(s.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      freeShown.forEach((s) => next.add(s.id));
      setSelected(next);
    }
  }

  function toggleStream(id: string) {
    const next = new Set(selectedStreams);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStreams(next);
  }

  function toggleAllStreams() {
    if (selectedStreams.size === streams.length) setSelectedStreams(new Set());
    else setSelectedStreams(new Set(streams.map((s) => s.id)));
  }

  function goAddStream(station: FreeRadioStation) {
    router.push(addStreamHref(station));
  }

  function toggleCatalogPreview(station: FreeRadioStation) {
    if (preview?.kind === "catalog" && preview.station.id === station.id) {
      setPreview(null);
    } else {
      setPreview({ kind: "catalog", station });
    }
  }

  function toggleStreamPreview(stream: Stream) {
    if (preview?.kind === "stream" && preview.stream.id === stream.id) {
      setPreview(null);
    } else {
      setPreview({ kind: "stream", stream });
    }
  }

  async function bulkAddCatalog() {
    const ids = Array.from(selected);
    if (!ids.length) {
      setMsg("Select at least one station from the catalog.");
      return;
    }
    setBusyId("__bulk__");
    setMsg("");
    let ok = 0;
    let fail = 0;
    for (const stationId of ids) {
      const station = FREE_RADIO_STATIONS.find((s) => s.id === stationId);
      if (!station) continue;
      const res = await fetch("/api/admin/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: station.name,
          source: station.streamUrl,
          type: "LIVE",
          isRadio: true,
          isActive: true,
        }),
      });
      if (res.ok) ok++;
      else fail++;
    }
    setBusyId(null);
    setMsg(`Added ${ok} stream(s)${fail ? `, ${fail} failed` : ""}.`);
    setSelected(new Set());
    load();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#00c0ef" }}>
            Radio stations
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Live streams flagged as radio (MP3/AAC/HLS URLs). Use <strong>Listen</strong> to preview in the browser.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/radios/mass-edit"
            className="text-sm px-3 py-2 rounded-md font-medium border cursor-pointer"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Mass edit radios
          </Link>
          <Link
            href="/admin/streams/add?radio=1&from=radios"
            className="text-sm px-3 py-2 rounded-md font-medium"
            style={{ background: "#00a65a", color: "#fff" }}
          >
            + Add radio stream
          </Link>
        </div>
      </div>

      {msg && (
        <p className="text-sm rounded border px-3 py-2" style={{ borderColor: "var(--border)" }}>
          {msg}
        </p>
      )}

      {preview && (
        <RadioProbePlayer
          streamUrl={
            preview.kind === "catalog" ? preview.station.streamUrl : preview.stream.streamUrl
          }
          streamId={preview.kind === "stream" ? preview.stream.id : undefined}
          name={preview.kind === "catalog" ? preview.station.name : preview.stream.name}
          playFirst
        />
      )}

      <section
        className="rounded-lg border p-4 space-y-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#00c0ef" }}>
            Free radio catalog
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!selected.size || busyId === "__bulk__"}
              onClick={() => void bulkAddCatalog()}
              className="text-xs px-3 py-1.5 rounded cursor-pointer disabled:opacity-50 border"
              style={{ borderColor: "var(--border)" }}
            >
              {busyId === "__bulk__" ? "Adding…" : `Quick-add selected (${selected.size})`}
            </button>
            <button
              type="button"
              disabled={selected.size !== 1}
              onClick={() => {
                const id = Array.from(selected)[0];
                const station = FREE_RADIO_STATIONS.find((s) => s.id === id);
                if (station) goAddStream(station);
              }}
              className="text-xs px-3 py-1.5 rounded cursor-pointer disabled:opacity-50"
              style={{ background: "#00c0ef", color: "#fff" }}
            >
              Open selected in Add Stream
            </button>
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Use checkboxes for bulk actions. <strong>Listen</strong> previews the station; <strong>Add as stream</strong> opens the full add-stream form.
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded border px-3 py-2 text-sm bg-white text-black"
            style={{ borderColor: "var(--border)" }}
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
          >
            <option value="all">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
          <input
            placeholder="Filter name…"
            className="rounded border px-3 py-2 text-sm bg-white text-black"
            style={{ borderColor: "var(--border)" }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="overflow-auto max-h-[360px] rounded border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "rgba(0,192,239,0.1)" }}>
                <th className="p-2 w-10">
                  <input
                    type="checkbox"
                    checked={allCatalogSelected}
                    onChange={toggleAllCatalog}
                    aria-label="Select all visible stations"
                    className="cursor-pointer"
                  />
                </th>
                <th className="text-left p-2">Station</th>
                <th className="text-left p-2">Country</th>
                <th className="text-left p-2">Genre</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {freeShown.map((s) => (
                <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggleCatalog(s.id)}
                      aria-label={`Select ${s.name}`}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="p-2">{s.name}</td>
                  <td className="p-2" style={{ color: "var(--muted)" }}>
                    {s.countryName}
                  </td>
                  <td className="p-2 text-xs" style={{ color: "var(--muted)" }}>
                    {s.genre ?? "—"}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap space-x-1">
                    <button
                      type="button"
                      onClick={() => toggleCatalogPreview(s)}
                      className="text-xs px-2 py-1 rounded cursor-pointer border"
                      style={{
                        borderColor: "var(--border)",
                        background:
                          preview?.kind === "catalog" && preview.station.id === s.id
                            ? "var(--accent)"
                            : "transparent",
                        color:
                          preview?.kind === "catalog" && preview.station.id === s.id
                            ? "#fff"
                            : "var(--text)",
                      }}
                    >
                      {preview?.kind === "catalog" && preview.station.id === s.id ? "Stop" : "Listen"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => goAddStream(s)}
                      className="text-xs px-2 py-1 rounded cursor-pointer disabled:opacity-50"
                      style={{ background: "#00a65a", color: "#fff" }}
                    >
                      Add as stream
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Your radio streams</h2>
          {streams.length > 0 && (
            <Link
              href="/admin/radios/mass-edit"
              className="text-xs underline"
              style={{ color: "#00c0ef" }}
            >
              Mass edit {selectedStreams.size ? `(${selectedStreams.size} selected here)` : "all radios"}
            </Link>
          )}
        </div>
        {streams.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No radio streams yet. Add from the catalog above.
          </p>
        ) : (
          <div className="overflow-auto rounded border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "rgba(0,192,239,0.08)" }}>
                  <th className="p-2 w-10">
                    <input
                      type="checkbox"
                      checked={streams.length > 0 && selectedStreams.size === streams.length}
                      onChange={toggleAllStreams}
                      aria-label="Select all your radio streams"
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">URL</th>
                  <th className="text-left p-2">Status</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {streams.map((s) => (
                  <tr key={s.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selectedStreams.has(s.id)}
                        onChange={() => toggleStream(s.id)}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="p-2">{s.name}</td>
                    <td className="p-2 font-mono text-xs max-w-md truncate" style={{ color: "var(--muted)" }}>
                      {s.streamUrl}
                    </td>
                    <td className="p-2">{s.isActive ? "Active" : "Off"}</td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => toggleStreamPreview(s)}
                        className="text-xs px-2 py-1 rounded cursor-pointer border"
                        style={{
                          borderColor: "var(--border)",
                          background:
                            preview?.kind === "stream" && preview.stream.id === s.id
                              ? "var(--accent)"
                              : "transparent",
                          color:
                            preview?.kind === "stream" && preview.stream.id === s.id
                              ? "#fff"
                              : "var(--text)",
                        }}
                      >
                        {preview?.kind === "stream" && preview.stream.id === s.id ? "Stop" : "Listen"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {selectedStreams.size > 0 && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Use{" "}
            <Link href="/admin/radios/mass-edit" className="underline" style={{ color: "#00c0ef" }}>
              Mass edit radios
            </Link>{" "}
            to apply bulk enable/disable/delete to your streams.
          </p>
        )}
      </section>
    </div>
  );
}
