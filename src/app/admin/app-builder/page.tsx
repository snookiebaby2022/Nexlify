"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Trash2, Clock, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { formatDateTime } from "@/lib/format";

type Build = {
  id: string;
  appName: string;
  packageName: string;
  logoUrl: string | null;
  primaryColor: string;
  serverUrl: string | null;
  status: string;
  downloadUrl: string | null;
  createdAt: string;
  completedAt: string | null;
};

export default function AppBuilderPage() {
  const [form, setForm] = useState({
    appName: "",
    packageName: "",
    logoUrl: "",
    primaryColor: "#00c0ef",
    serverUrl: "",
  });
  const [generating, setGenerating] = useState(false);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [error, setError] = useState("");

  function load() {
    fetch("/api/admin/app-builder")
      .then((r) => r.json())
      .then((d) => setBuilds(d.builds ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function generate() {
    setGenerating(true);
    setError("");
    const res = await fetch("/api/admin/app-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to queue build");
    } else {
      setForm({ appName: "", packageName: "", logoUrl: "", primaryColor: "#00c0ef", serverUrl: "" });
      load();
    }
  }

  async function removeBuild(id: string) {
    if (!confirm("Delete this build record?")) return;
    await fetch(`/api/admin/app-builder?id=${id}`, { method: "DELETE" });
    load();
  }

  function statusIcon(status: string) {
    if (status === "COMPLETED") return <CheckCircle size={16} className="text-green-500" />;
    if (status === "FAILED") return <AlertCircle size={16} className="text-red-500" />;
    if (status === "BUILDING") return <RefreshCw size={16} className="animate-spin text-blue-500" />;
    return <Clock size={16} className="text-yellow-500" />;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">App Builder</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Generate a branded Android APK for your IPTV service. Customize the app name, colors, and server URL.
          </p>
        </div>
      </div>

      <div
        className="rounded-lg border p-4 text-sm space-y-2"
        style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}
      >
        <h3 className="font-semibold" style={{ color: "var(--accent)" }}>ℹ️ How it works</h3>
        <p style={{ color: "var(--muted)" }}>
          Enter your branding details below. The app builder queues a custom Android APK build with your logo, colors, and pre-configured server URL. Once built, you and your customers can download the APK directly.
        </p>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Note: Full APK generation requires build-server infrastructure. Queued builds will be processed when the build pipeline is connected.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border p-3 text-sm text-red-500" style={{ borderColor: "var(--danger)" }}>
          {error}
        </div>
      )}

      <div className="rounded-lg border p-5 space-y-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm block mb-1">App Name</label>
            <input
              type="text"
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              placeholder="My IPTV"
              value={form.appName}
              onChange={(e) => setForm({ ...form, appName: e.target.value })}
            />
          </div>
          <div>
            <label className="text-sm block mb-1">Package Name</label>
            <input
              type="text"
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              placeholder="com.yourcompany.iptv"
              value={form.packageName}
              onChange={(e) => setForm({ ...form, packageName: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="text-sm block mb-1">Logo URL</label>
          <input
            type="url"
            className="w-full rounded border px-3 py-2 bg-transparent"
            style={{ borderColor: "var(--border)" }}
            placeholder="https://yoursite.com/logo.png"
            value={form.logoUrl}
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm block mb-1">Primary Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="w-12 h-10 rounded border bg-transparent cursor-pointer"
                style={{ borderColor: "var(--border)" }}
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              />
              <input
                type="text"
                className="flex-1 rounded border px-3 py-2 bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="text-sm block mb-1">Server URL</label>
            <input
              type="url"
              className="w-full rounded border px-3 py-2 bg-transparent"
              style={{ borderColor: "var(--border)" }}
              placeholder="https://panel.yourdomain.com"
              value={form.serverUrl}
              onChange={(e) => setForm({ ...form, serverUrl: e.target.value })}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating || !form.appName || !form.packageName}
          className="w-full rounded py-2.5 font-semibold text-sm cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff", opacity: generating || !form.appName || !form.packageName ? 0.5 : 1 }}
        >
          {generating ? "Queueing build…" : "Queue Branded APK Build"}
        </button>
      </div>

      {builds.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="font-semibold text-sm">Build History</h3>
          <div className="space-y-2">
            {builds.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 text-sm border-b pb-2 last:border-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  {statusIcon(b.status)}
                  <span className="font-medium">{b.appName}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{b.packageName}</span>
                </div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {formatDateTime(b.createdAt)}
                </div>
                <div className="flex items-center gap-2">
                  {b.downloadUrl ? (
                    <a
                      href={b.downloadUrl}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded"
                      style={{ background: "var(--accent)", color: "#fff" }}
                    >
                      <Download size={12} />
                      Download
                    </a>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                      {b.status}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeBuild(b.id)}
                    className="p-1 rounded hover:opacity-70 cursor-pointer"
                    style={{ color: "var(--danger)" }}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
