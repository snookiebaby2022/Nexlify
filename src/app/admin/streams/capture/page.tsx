"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormField, FormPageShell, formInputClass, formInputStyle, formSelectClass } from "@/components/form-page-shell";

export default function CaptureIngestPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    device: "/dev/video0",
    kind: "v4l2" as "v4l2" | "dshow" | "decklink" | "avfoundation",
    serverId: "",
    categoryId: "",
  });

  useEffect(() => {
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []))
      .catch(() => {});
    fetch("/api/admin/categories?type=LIVE")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, []);

  function sourceUrl() {
    const d = form.device.trim();
    if (form.kind === "v4l2") return d.startsWith("v4l2://") ? d : `v4l2://${d.replace(/^\/\//, "")}`;
    return `${form.kind}://${d.replace(/^[a-z]+:\/\//i, "")}`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!form.name.trim()) {
      setMsg("Name is required.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        type: "LIVE",
        streamUrl: sourceUrl(),
        isCreatedChannel: true,
        autoRestart: true,
        isOnDemand: false,
        serverId: form.serverId || undefined,
        categoryId: form.categoryId || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg(data.error ?? "Failed to add capture source");
      return;
    }
    router.push("/admin/created_channels");
  }

  return (
    <FormPageShell title="Capture card / CCTV" manageHref="/admin/created_channels" manageLabel="Created channels">
      <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        Ingest HDMI / USB capture or CCTV via FFmpeg on the stream server (same idea as XUI capture input).
        Linux uses Video4Linux (<code>v4l2:///dev/video0</code>). Windows uses DirectShow.
      </p>
      <form onSubmit={submit} className="space-y-4 max-w-xl">
        {msg ? <p className="text-sm text-red-400">{msg}</p> : null}
        <FormField label="Channel name" required>
          <input
            className={formInputClass}
            style={formInputStyle}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </FormField>
        <FormField label="Device type">
          <select
            className={formSelectClass}
            style={formInputStyle}
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind })}
          >
            <option value="v4l2">Linux V4L2 (USB / HDMI capture)</option>
            <option value="dshow">Windows DirectShow</option>
            <option value="decklink">Blackmagic DeckLink</option>
            <option value="avfoundation">macOS AVFoundation</option>
          </select>
        </FormField>
        <FormField label="Device path / name">
          <input
            className={formInputClass}
            style={formInputStyle}
            value={form.device}
            onChange={(e) => setForm({ ...form, device: e.target.value })}
            placeholder={form.kind === "dshow" ? "video=USB Capture" : "/dev/video0"}
          />
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Saved as {sourceUrl()}
          </p>
        </FormField>
        <FormField label="Stream server">
          <select
            className={formSelectClass}
            style={formInputStyle}
            value={form.serverId}
            onChange={(e) => setForm({ ...form, serverId: e.target.value })}
          >
            <option value="">Auto (least loaded)</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Category">
          <select
            className={formSelectClass}
            style={formInputStyle}
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <button
          type="submit"
          disabled={saving}
          className="rounded px-4 py-2 text-sm text-white"
          style={{ background: "var(--accent)" }}
        >
          {saving ? "Saving…" : "Add capture channel"}
        </button>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Overlay watermark (Settings → Playback Fingerprint) applies to these FFmpeg restreams.{" "}
          <Link href="/admin/settings/fingerprint" style={{ color: "var(--accent)" }}>
            Open overlay settings
          </Link>
        </p>
      </form>
    </FormPageShell>
  );
}
