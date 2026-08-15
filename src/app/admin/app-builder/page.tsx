"use client";

import { useEffect, useState } from "react";
import { Download, Trash2, Clock, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { formatDateTime } from "@/lib/format";

type Build = {
  id: string;
  appName: string;
  packageName: string;
  logoUrl: string | null;
  splashUrl?: string | null;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  serverUrl: string | null;
  config?: Record<string, unknown> | null;
  status: string;
  downloadUrl: string | null;
  createdAt: string;
  completedAt: string | null;
};

const emptyForm = {
  appName: "",
  packageName: "",
  logoUrl: "",
  splashUrl: "",
  loginBgUrl: "",
  primaryColor: "#00c0ef",
  secondaryColor: "#0f172a",
  accentColor: "#22c55e",
  theme: "dark",
  serverUrl: "",
  dnsHosts: "",
  welcomeText: "Welcome — sign in with your IPTV line",
  contactEmail: "",
  supportUrl: "",
  telegram: "",
  whatsapp: "",
  website: "",
  playerType: "exo",
  allowCast: true,
  allowPip: true,
  showEpg: true,
  showCatchup: false,
  adultPinRequired: false,
  forceUpdate: false,
  hideServerUrl: true,
  versionName: "1.0.0",
  versionCode: "1",
  minAndroidSdk: "24",
  platforms: "android",
  xtreamPath: "/player_api.php",
  bundleIdIos: "",
  notes: "",
};

export default function AppBuilderPage() {
  const [form, setForm] = useState(emptyForm);
  const [generating, setGenerating] = useState(false);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [error, setError] = useState("");
  const [previewTab, setPreviewTab] = useState<"brand" | "player" | "connect" | "release">("brand");

  function load() {
    fetch("/api/admin/app-builder")
      .then((r) => r.json())
      .then((d) => setBuilds(d.builds ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  function set<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function generate() {
    setGenerating(true);
    setError("");
    const payload = {
      ...form,
      versionCode: Number(form.versionCode) || 1,
      minAndroidSdk: Number(form.minAndroidSdk) || 24,
      platforms: form.platforms.split(/[\s,]+/).filter(Boolean),
      dnsHostsText: form.dnsHosts,
    };
    const res = await fetch("/api/admin/app-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to queue build");
    } else {
      setForm(emptyForm);
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

  const tabs = [
    { id: "brand" as const, label: "Branding" },
    { id: "connect" as const, label: "Servers & DNS" },
    { id: "player" as const, label: "Player & UX" },
    { id: "release" as const, label: "Release" },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">App Builder</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Design a branded IPTV app (Android / iOS config): logos, theme, DNS failover, player options,
          EPG/catch-up, adult PIN, and release metadata. Builds queue for the APK pipeline.
        </p>
      </div>

      <div
        className="rounded-lg border p-4 text-sm"
        style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}
      >
        <p style={{ color: "var(--muted)" }}>
          Live preview uses your primary / secondary / accent colors. Full APK output needs the build
          server; until then builds stay <strong>QUEUED</strong> with the full config saved for the pipeline.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border p-3 text-sm text-red-500" style={{ borderColor: "var(--danger)" }}>
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPreviewTab(t.id)}
            className="rounded-lg px-3 py-1.5 text-sm cursor-pointer"
            style={{
              background: previewTab === t.id ? "var(--accent)" : "transparent",
              color: previewTab === t.id ? "#fff" : "var(--text)",
              border: `1px solid ${previewTab === t.id ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_220px] gap-4">
        <div className="rounded-lg border p-5 space-y-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          {previewTab === "brand" && (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block text-sm">
                  App name *
                  <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.appName} onChange={(e) => set("appName", e.target.value)} placeholder="My IPTV" />
                </label>
                <label className="block text-sm">
                  Android package *
                  <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.packageName} onChange={(e) => set("packageName", e.target.value)} placeholder="com.company.iptv" />
                </label>
              </div>
              <label className="block text-sm">
                Logo URL
                <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…/logo.png" />
              </label>
              <label className="block text-sm">
                Splash / launch image URL
                <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.splashUrl} onChange={(e) => set("splashUrl", e.target.value)} />
              </label>
              <label className="block text-sm">
                Login background URL
                <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.loginBgUrl} onChange={(e) => set("loginBgUrl", e.target.value)} />
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ["primaryColor", "Primary"],
                    ["secondaryColor", "Secondary"],
                    ["accentColor", "Accent"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block text-sm">
                    {label}
                    <div className="mt-1 flex gap-2 items-center">
                      <input type="color" className="w-10 h-9 rounded border cursor-pointer" style={{ borderColor: "var(--border)" }} value={form[key]} onChange={(e) => set(key, e.target.value)} />
                      <input className="flex-1 rounded border px-2 py-1.5 bg-transparent text-xs" style={{ borderColor: "var(--border)" }} value={form[key]} onChange={(e) => set(key, e.target.value)} />
                    </div>
                  </label>
                ))}
              </div>
              <label className="block text-sm">
                Theme
                <select className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.theme} onChange={(e) => set("theme", e.target.value)}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">Follow system</option>
                </select>
              </label>
              <label className="block text-sm">
                Welcome / login text
                <textarea className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm min-h-[72px]" style={{ borderColor: "var(--border)" }} value={form.welcomeText} onChange={(e) => set("welcomeText", e.target.value)} />
              </label>
            </>
          )}

          {previewTab === "connect" && (
            <>
              <label className="block text-sm">
                Primary panel / Xtream URL
                <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.serverUrl} onChange={(e) => set("serverUrl", e.target.value)} placeholder="https://panel.example.com" />
              </label>
              <label className="block text-sm">
                DNS / failover hosts (one per line)
                <textarea className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm min-h-[100px] font-mono" style={{ borderColor: "var(--border)" }} value={form.dnsHosts} onChange={(e) => set("dnsHosts", e.target.value)} placeholder={"https://dns1.example.com\nhttps://dns2.example.com"} />
              </label>
              <label className="block text-sm">
                Xtream API path
                <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.xtreamPath} onChange={(e) => set("xtreamPath", e.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.hideServerUrl} onChange={(e) => set("hideServerUrl", e.target.checked)} />
                Hide server URL field in the app (DNS only)
              </label>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block text-sm">
                  Support email
                  <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
                </label>
                <label className="block text-sm">
                  Support / portal URL
                  <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.supportUrl} onChange={(e) => set("supportUrl", e.target.value)} />
                </label>
                <label className="block text-sm">
                  Telegram
                  <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.telegram} onChange={(e) => set("telegram", e.target.value)} placeholder="@channel or t.me/…" />
                </label>
                <label className="block text-sm">
                  WhatsApp
                  <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
                </label>
                <label className="block text-sm sm:col-span-2">
                  Website
                  <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.website} onChange={(e) => set("website", e.target.value)} />
                </label>
              </div>
            </>
          )}

          {previewTab === "player" && (
            <>
              <label className="block text-sm">
                Player engine
                <select className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.playerType} onChange={(e) => set("playerType", e.target.value)}>
                  <option value="exo">ExoPlayer (recommended)</option>
                  <option value="vlc">VLC / LibVLC</option>
                  <option value="media3">Media3</option>
                </select>
              </label>
              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                {(
                  [
                    ["allowCast", "Chromecast / Google Cast"],
                    ["allowPip", "Picture-in-picture"],
                    ["showEpg", "Show EPG / TV guide"],
                    ["showCatchup", "Catch-up / archive"],
                    ["adultPinRequired", "Adult PIN gate"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>
            </>
          )}

          {previewTab === "release" && (
            <>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="block text-sm">
                  Version name
                  <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.versionName} onChange={(e) => set("versionName", e.target.value)} />
                </label>
                <label className="block text-sm">
                  Version code
                  <input type="number" min={1} className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.versionCode} onChange={(e) => set("versionCode", e.target.value)} />
                </label>
                <label className="block text-sm">
                  Min Android SDK
                  <input type="number" min={21} className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.minAndroidSdk} onChange={(e) => set("minAndroidSdk", e.target.value)} />
                </label>
              </div>
              <label className="block text-sm">
                Platforms
                <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.platforms} onChange={(e) => set("platforms", e.target.value)} placeholder="android, ios" />
              </label>
              <label className="block text-sm">
                iOS bundle ID (optional)
                <input className="mt-1 w-full rounded border px-3 py-2 bg-transparent" style={{ borderColor: "var(--border)" }} value={form.bundleIdIos} onChange={(e) => set("bundleIdIos", e.target.value)} placeholder="com.company.iptv" />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.forceUpdate} onChange={(e) => set("forceUpdate", e.target.checked)} />
                Force update when a newer build is published
              </label>
              <label className="block text-sm">
                Internal notes
                <textarea className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm min-h-[72px]" style={{ borderColor: "var(--border)" }} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </label>
            </>
          )}

          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating || !form.appName || !form.packageName}
            className="w-full rounded py-2.5 font-semibold text-sm cursor-pointer disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {generating ? "Queueing…" : "Queue branded app build"}
          </button>
        </div>

        <div
          className="rounded-2xl border p-4 h-fit sticky top-4"
          style={{
            borderColor: "var(--border)",
            background: `linear-gradient(160deg, ${form.secondaryColor}, ${form.primaryColor}55)`,
          }}
        >
          <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.7)" }}>
            Preview
          </p>
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: "rgba(255,255,255,0.15)", background: form.theme === "light" ? "#f8fafc" : "#0b1220" }}>
            <div className="h-16 flex items-center justify-center" style={{ background: form.primaryColor }}>
              {form.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logoUrl} alt="" className="h-10 max-w-[80%] object-contain" />
              ) : (
                <span className="text-white text-sm font-semibold">{form.appName || "App name"}</span>
              )}
            </div>
            <div className="p-3 space-y-2">
              <p className="text-xs" style={{ color: form.theme === "light" ? "#334155" : "#cbd5e1" }}>
                {form.welcomeText || "Login"}
              </p>
              <div className="h-8 rounded" style={{ background: form.theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.08)" }} />
              <div className="h-8 rounded" style={{ background: form.theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.08)" }} />
              <div className="h-9 rounded flex items-center justify-center text-xs font-semibold text-white" style={{ background: form.accentColor }}>
                Sign in
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px]" style={{ color: "rgba(255,255,255,0.65)" }}>
            {form.packageName || "com.example.app"} · v{form.versionName}
          </p>
        </div>
      </div>

      {builds.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="font-semibold text-sm">Build history</h3>
          <div className="space-y-2">
            {builds.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 text-sm border-b pb-2 last:border-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  {statusIcon(b.status)}
                  <span className="font-medium">{b.appName}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {b.packageName}
                  </span>
                </div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {formatDateTime(b.createdAt)}
                </div>
                <div className="flex items-center gap-2">
                  {b.downloadUrl ? (
                    <a href={b.downloadUrl} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ background: "var(--accent)", color: "#fff" }}>
                      <Download size={12} />
                      Download
                    </a>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                      {b.status}
                    </span>
                  )}
                  <button type="button" onClick={() => removeBuild(b.id)} className="p-1 rounded hover:opacity-70 cursor-pointer" style={{ color: "var(--danger)" }} title="Delete">
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
