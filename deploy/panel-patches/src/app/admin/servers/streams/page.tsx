"use client";



import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { DataTable } from "@/components/data-table";

import { StreamProbePlayer } from "@/components/stream-probe-player";
import { StreamLiveInfo } from "@/components/stream-live-info";

import {

  StreamAdvancedSections,

  StreamFeatureBadges,

  advancedFromStream,

  advancedToPayload,

  emptyAdvancedState,

  type StreamAdvancedState,

} from "@/components/stream-advanced-sections";



type Stream = {

  id: string;

  name: string;

  streamUrl: string;

  type: string;

  epgChannelId: string | null;
  serverId?: string | null;
  categoryId?: string | null;
  category?: { name: string } | null;

  server?: { name: string } | null;

  isActive: boolean;

  isShifted?: boolean;

  timeshiftSeconds?: number | null;

  parentStreamId?: string | null;

  parentStream?: { id: string; name: string } | null;

  dnsRotator?: unknown;

  bitrates?: unknown;

};



function AdminStreamsContent() {
  const searchParams = useSearchParams();

  const [streams, setStreams] = useState<Stream[]>([]);

  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const [previewId, setPreviewId] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);

  const [advanced, setAdvanced] = useState<StreamAdvancedState>(emptyAdvancedState());

  const [form, setForm] = useState({

    name: "",

    streamUrl: "",

    type: "LIVE",

    serverId: "",

    categoryId: "",

    epgChannelId: "",

  });



  function load() {

    fetch("/api/admin/streams?lite=1")

      .then((r) => r.json())

      .then((d) => setStreams(d.streams));

    fetch("/api/admin/servers")

      .then((r) => r.json())

      .then((d) => setServers(d.servers));

    fetch("/api/admin/categories")

      .then((r) => r.json())

      .then((d) => setCategories(d.categories));

  }



  useEffect(() => {

    load();

  }, []);

  useEffect(() => {
    const id = searchParams.get("edit");
    if (!id || !streams.length) return;
    const stream = streams.find((s) => s.id === id);
    if (stream) {
      setEditId(stream.id);
      setForm({
        name: stream.name,
        streamUrl: stream.streamUrl,
        type: stream.type,
        serverId: stream.serverId ?? "",
        categoryId: stream.categoryId ?? "",
        epgChannelId: stream.epgChannelId ?? "",
      });
      setAdvanced(advancedFromStream(stream));
    }
  }, [searchParams, streams]);



  async function addStream(e: React.FormEvent) {

    e.preventDefault();

    await fetch("/api/admin/streams", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({

        ...form,

        serverId: form.serverId || null,

        categoryId: form.categoryId || null,

        ...advancedToPayload(advanced),

      }),

    });

    setForm({

      name: "",

      streamUrl: "",

      type: "LIVE",

      serverId: "",

      categoryId: "",

      epgChannelId: "",

    });

    setAdvanced(emptyAdvancedState());

    load();

  }



  async function saveEdit(e: React.FormEvent) {

    e.preventDefault();

    if (!editId) return;

    const stream = streams.find((s) => s.id === editId);

    if (!stream) return;

    await fetch("/api/admin/streams", {

      method: "PATCH",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({

        id: editId,

        name: form.name,

        source: form.streamUrl,

        serverId: form.serverId || null,

        categoryId: form.categoryId || null,

        epgChannelId: form.epgChannelId || null,

        ...advancedToPayload(advanced),

      }),

    });

    setEditId(null);

    load();

  }



  function startEdit(s: Stream) {

    setEditId(s.id);

    setForm({

      name: s.name,

      streamUrl: s.streamUrl,

      type: s.type,

      serverId: s.serverId ?? "",

      categoryId: s.categoryId ?? "",

      epgChannelId: s.epgChannelId ?? "",

    });

    setAdvanced(advancedFromStream(s));

    setPreviewId(null);

  }



  const preview = streams.find((s) => s.id === previewId);

  const parentOptions = streams.filter((s) => s.type === "LIVE" && s.id !== editId).map((s) => ({ id: s.id, name: s.name }));



  return (

    <div className="space-y-6">

      <h1 className="text-2xl font-semibold">Manage streams</h1>



      <form

        onSubmit={editId ? saveEdit : addStream}

        className="rounded-lg border p-4 space-y-4"

        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}

      >

        <p className="text-sm font-medium">{editId ? "Edit stream" : "Add stream"}</p>

        {editId && <StreamLiveInfo streamId={editId} />}

        <div className="grid md:grid-cols-3 gap-3">

          <input

            placeholder="Channel name"

            className="rounded border px-3 py-2 bg-transparent"

            style={{ borderColor: "var(--border)" }}

            value={form.name}

            onChange={(e) => setForm({ ...form, name: e.target.value })}

            required

          />

          <input

            placeholder="Stream URL"

            className="rounded border px-3 py-2 bg-transparent md:col-span-2"

            style={{ borderColor: "var(--border)" }}

            value={form.streamUrl}

            onChange={(e) => setForm({ ...form, streamUrl: e.target.value })}

            required

          />

          <select

            className="rounded border px-3 py-2 bg-transparent"

            style={{ borderColor: "var(--border)" }}

            value={form.serverId}

            onChange={(e) => setForm({ ...form, serverId: e.target.value })}

          >

            <option value="">No server</option>

            {servers.map((s) => (

              <option key={s.id} value={s.id}>

                {s.name}

              </option>

            ))}

          </select>

          <select

            className="rounded border px-3 py-2 bg-transparent"

            style={{ borderColor: "var(--border)" }}

            value={form.categoryId}

            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}

          >

            <option value="">No category</option>

            {categories.map((c) => (

              <option key={c.id} value={c.id}>

                {c.name}

              </option>

            ))}

          </select>

          <input

            placeholder="EPG channel ID"

            className="rounded border px-3 py-2 bg-transparent"

            style={{ borderColor: "var(--border)" }}

            value={form.epgChannelId}

            onChange={(e) => setForm({ ...form, epgChannelId: e.target.value })}

          />

        </div>

        <StreamAdvancedSections adv={advanced} setAdv={setAdvanced} parentOptions={parentOptions} />

        <div className="flex gap-2">

          <button

            type="submit"

            className="rounded py-2 px-4 font-medium cursor-pointer"

            style={{ background: "var(--accent)", color: "#fff" }}

          >

            {editId ? "Save changes" : "Add stream"}

          </button>

          {editId && (

            <button

              type="button"

              className="rounded py-2 px-4 border cursor-pointer"

              style={{ borderColor: "var(--border)" }}

              onClick={() => {

                setEditId(null);

                setAdvanced(emptyAdvancedState());

              }}

            >

              Cancel edit

            </button>

          )}

        </div>

      </form>



      {preview && (

        <StreamProbePlayer
          streamId={preview.id}
          streamUrl={preview.streamUrl}
          name={preview.name}
          playFirst
        />

      )}



      <DataTable

        headers={["Name", "Features", "Server", "Category", "Type", "Status", ""]}

        rows={streams.map((s) => [

          s.name,

          <StreamFeatureBadges key={`b-${s.id}`} stream={s} />,

          s.server?.name ?? "—",

          s.category?.name ?? "—",

          s.type,

          s.isActive ? "Active" : "Off",

          <div key={s.id} className="flex gap-2">

            <button

              type="button"

              className="text-xs px-2 py-1 rounded cursor-pointer"

              style={{ border: "1px solid var(--border)" }}

              onClick={() => startEdit(s)}

            >

              Edit

            </button>

            <button

              type="button"

              className="text-xs px-2 py-1 rounded cursor-pointer"

              style={{

                background: previewId === s.id ? "var(--accent)" : "transparent",

                color: previewId === s.id ? "#fff" : "var(--accent)",

                border: previewId === s.id ? "none" : "1px solid var(--border)",

              }}

              onClick={() => setPreviewId(previewId === s.id ? null : s.id)}

            >

              {previewId === s.id ? "Close" : "Probe"}

            </button>

          </div>,

        ])}

      />

    </div>

  );

}

export default function AdminStreamsPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm p-6" style={{ color: "var(--muted)" }}>
          Loading streams…
        </p>
      }
    >
      <AdminStreamsContent />
    </Suspense>
  );
}
