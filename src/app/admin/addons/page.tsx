"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FormPageShell } from "@/components/form-page-shell";
import { BUILTIN_ADDONS, builtinAddonsByCategory } from "@/lib/builtin-addons-catalog";
import { MUSIC_ADDONS, musicAddonHref } from "@/lib/music-addons-catalog";
import { FEATURE_PACKS } from "@/lib/feature-packs";

type PluginDef = {
  id: string;
  href: string;
  name: string;
  description: string;
  color: string;
  gradient: string;
  monogram: string;
  version: string;
  external?: boolean;
};

const MEDIA_PLUGINS: PluginDef[] = [
  {
    id: "plex",
    href: "/admin/integrations/plex",
    name: "Plex",
    description: "Import Plex libraries as streamable VOD on your lines.",
    color: "#e5a00d",
    gradient: "linear-gradient(135deg, #e5a00d 0%, #b87d08 100%)",
    monogram: "Px",
    version: "v1.0",
  },
  {
    id: "emby",
    href: "/admin/integrations/emby",
    name: "Emby",
    description: "Connect Emby and sync movies and series to bouquets.",
    color: "#52b54b",
    gradient: "linear-gradient(135deg, #52b54b 0%, #3d8f37 100%)",
    monogram: "Em",
    version: "v1.0",
  },
  {
    id: "jellyfin",
    href: "/admin/integrations/jellyfin",
    name: "Jellyfin",
    description: "Connect Jellyfin and sync your media library.",
    color: "#00a4dc",
    gradient: "linear-gradient(135deg, #00a4dc 0%, #007aa3 100%)",
    monogram: "Jf",
    version: "v1.0",
  },
  {
    id: "youtube",
    href: "/admin/integrations/youtube",
    name: "YouTube",
    description: "Import channels or playlists as live stream entries.",
    color: "#ff0000",
    gradient: "linear-gradient(135deg, #ff0000 0%, #cc0000 100%)",
    monogram: "YT",
    version: "v1.0",
  },
];

const TOOL_PLUGINS: PluginDef[] = [
  {
    id: "proxy_plugins",
    href: "/admin/servers/proxies",
    name: "Proxies",
    description: "Load-balancer and edge proxy management for streams.",
    color: "#00c0ef",
    gradient: "linear-gradient(135deg, #00c0ef 0%, #3c8dbc 100%)",
    monogram: "Px",
    version: "v1.0",
  },
  {
    id: "statistics",
    href: "/admin/dashboard",
    name: "Statistics",
    description: "Dashboard metrics, live connections, and activity logs.",
    color: "#8b5cf6",
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
    monogram: "St",
    version: "v1.0",
  },
];

const THIRD_PARTY: PluginDef[] = [];

function musicPlugins(): PluginDef[] {
  return MUSIC_ADDONS.map((m) => ({
    id: m.id,
    href: musicAddonHref(m.id),
    name: m.name,
    description: m.description.split(".")[0] + ".",
    color: m.color,
    gradient: `linear-gradient(135deg, ${m.color} 0%, ${m.color}cc 100%)`,
    monogram: m.name.slice(0, 2),
    version: "v1.0",
  }));
}

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 pt-2 pb-1">
      <h2
        className="text-xs font-semibold uppercase tracking-[0.2em]"
        style={{ color: "var(--muted)" }}
      >
        {title}
      </h2>
      {action}
      <div className="flex-1 h-px ml-4" style={{ background: "var(--border)" }} />
    </div>
  );
}

function PromoCard({
  title,
  body,
  href,
  hrefLabel,
  external,
}: {
  title: string;
  body: string;
  href: string;
  hrefLabel: string;
  external?: boolean;
}) {
  const inner = (
    <div
      className="group relative overflow-hidden rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 transition-transform hover:-translate-y-0.5"
      style={{
        background: "linear-gradient(120deg, #00c0ef 0%, #3c8dbc 45%, #2a9fd6 100%)",
        boxShadow: "0 8px 24px rgba(0, 192, 239, 0.25)",
      }}
    >
      <div
        className="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg"
        style={{ background: "rgba(255,255,255,0.2)" }}
      >
        Nx
      </div>
      <div className="flex-1 min-w-0 text-white">
        <div className="text-base font-semibold">{title}</div>
        <p className="text-sm mt-1 text-white/85 leading-relaxed">{body}</p>
      </div>
      <span className="inline-flex items-center gap-2 shrink-0 rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white group-hover:bg-white/25 transition-colors">
        {hrefLabel}
        <span aria-hidden>→</span>
      </span>
    </div>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block sm:col-span-2">
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className="block sm:col-span-2">
      {inner}
    </Link>
  );
}

function BuiltinPluginCard({
  plugin,
  configured,
}: {
  plugin: (typeof BUILTIN_ADDONS)[number];
  configured: boolean;
}) {
  const gradient = `linear-gradient(135deg, ${plugin.color} 0%, ${plugin.color}cc 100%)`;
  return (
    <Link href={plugin.href} className="block">
      <div
        className="group flex gap-4 rounded-xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-card)",
        }}
      >
        <div className="relative shrink-0">
          <div
            className="w-[72px] h-[72px] rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-md text-center px-1 leading-tight"
            style={{ background: gradient }}
          >
            {plugin.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
          </div>
          <span
            className="absolute -top-2 -left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow"
            style={{ background: "#0ea5e9" }}
          >
            Built-in
          </span>
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm">{plugin.name}</span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: "rgba(14,165,233,0.12)", color: "#0ea5e9" }}
            >
              Included
            </span>
          </div>
          <p className="text-xs mt-1.5 leading-relaxed line-clamp-2" style={{ color: "var(--muted)" }}>
            {plugin.description}
          </p>
          <div className="mt-auto pt-3 flex items-center justify-between gap-2">
            <span className="text-[11px]" style={{ color: configured ? "#22c55e" : "var(--muted)" }}>
              {configured ? "Configured on this panel" : "Ready to configure"}
            </span>
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors group-hover:border-[#0ea5e9] group-hover:text-[#0ea5e9]"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              aria-hidden
            >
              ⚙
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function PluginCard({
  plugin,
  configured,
}: {
  plugin: PluginDef;
  configured: boolean;
}) {
  const card = (
    <div
      className="group flex gap-4 rounded-xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-card)",
      }}
    >
      <div className="relative shrink-0">
        <div
          className="w-[72px] h-[72px] rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md"
          style={{ background: plugin.gradient }}
        >
          {plugin.monogram}
        </div>
        {configured && (
          <span
            className="absolute -top-2 -left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow"
            style={{ background: "#22c55e" }}
          >
            Active
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm">{plugin.name}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: plugin.external ? "rgba(34,197,94,0.15)" : "rgba(0,192,239,0.12)",
              color: plugin.external ? "#22c55e" : "#00c0ef",
            }}
          >
            {plugin.version}
          </span>
        </div>
        <p className="text-xs mt-1.5 leading-relaxed line-clamp-2" style={{ color: "var(--muted)" }}>
          {plugin.description}
        </p>
        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
          <span className="text-[11px]" style={{ color: configured ? "#22c55e" : "var(--muted)" }}>
            {configured ? "Configured on this panel" : "Ready to configure"}
          </span>
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors group-hover:border-[#00c0ef] group-hover:text-[#00c0ef]"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            aria-hidden
          >
            {plugin.external ? "↗" : "⚙"}
          </span>
        </div>
      </div>
    </div>
  );

  if (plugin.external) {
    return (
      <a href={plugin.href} target="_blank" rel="noopener noreferrer" className="block">
        {card}
      </a>
    );
  }
  return (
    <Link href={plugin.href} className="block">
      {card}
    </Link>
  );
}

export default function AddonsOverviewPage() {
  const [integrations, setIntegrations] = useState<{ type: string }[]>([]);
  const [licenses, setLicenses] = useState<{ service: string; isActive: boolean }[]>([]);
  const [panelSettings, setPanelSettings] = useState<Record<string, Record<string, unknown>>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/admin/integrations").then((r) => (r.ok ? r.json() : { items: [] })),
      fetch("/api/admin/addon-licenses").then((r) => (r.ok ? r.json() : { licenses: [] })),
      fetch("/api/admin/settings").then((r) => (r.ok ? r.json() : { settings: {} })),
    ])
      .then(([int, lic, settingsRes]) => {
        if (cancelled) return;
        setIntegrations(int.items ?? []);
        setLicenses(lic.licenses ?? []);
        setPanelSettings(settingsRes.settings ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const isBuiltinConfigured = useMemo(() => {
    return (plugin: (typeof BUILTIN_ADDONS)[number]) => {
      if (!plugin.settingGroup || !plugin.settingKey) return false;
      const group = panelSettings[plugin.settingGroup];
      if (!group) return false;
      const value = group[plugin.settingKey];
      if (typeof value === "string") return value.trim().length > 0;
      if (typeof value === "number") return value > 0;
      return Boolean(value);
    };
  }, [panelSettings]);

  const configuredIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of integrations) ids.add(row.type);
    for (const row of licenses) {
      if (row.isActive) ids.add(row.service);
    }
    return ids;
  }, [integrations, licenses]);

  const music = musicPlugins();
  const internalCount = MEDIA_PLUGINS.length + music.length + TOOL_PLUGINS.length;
  const builtinConfiguredCount = BUILTIN_ADDONS.filter((p) => isBuiltinConfigured(p)).length;
  const activeCount = [...configuredIds].filter(
    (id) =>
      MEDIA_PLUGINS.some((p) => p.id === id) ||
      music.some((p) => p.id === id) ||
      TOOL_PLUGINS.some((p) => p.id === id),
  ).length;

  const isFeaturePackActive = useMemo(() => {
    const bundled = panelSettings.general?.bundledFeaturePacks !== false;
    return (pack: (typeof FEATURE_PACKS)[number]) => {
      if (bundled) return true;
      if (configuredIds.has(pack.serviceId) || configuredIds.has(pack.id)) return true;
      const group = panelSettings[pack.settingGroup];
      if (!group || typeof group !== "object") return false;
      return Object.values(group).some((v) => {
        if (typeof v === "boolean") return v;
        if (typeof v === "string") return v.trim().length > 0;
        if (typeof v === "number") return v > 0;
        return Boolean(v);
      });
    };
  }, [configuredIds, panelSettings]);

  const configuredSummary = useMemo(() => {
    const items: { name: string; kind: string; href?: string }[] = [];
    for (const p of BUILTIN_ADDONS) {
      if (isBuiltinConfigured(p)) items.push({ name: p.name, kind: "Built-in", href: p.href });
    }
    for (const p of MEDIA_PLUGINS) {
      if (configuredIds.has(p.id)) items.push({ name: p.name, kind: "Integration", href: p.href });
    }
    for (const p of music) {
      if (configuredIds.has(p.id)) items.push({ name: p.name, kind: "Music", href: p.href });
    }
    for (const p of FEATURE_PACKS) {
      if (isFeaturePackActive(p)) items.push({ name: p.name, kind: "Feature pack", href: p.settingsHref });
    }
    for (const lic of licenses.filter((l) => l.isActive)) {
      if (!items.some((i) => i.name === lic.service)) {
        items.push({ name: lic.service, kind: "License" });
      }
    }
    return items;
  }, [configuredIds, isBuiltinConfigured, isFeaturePackActive, licenses, music]);

  const featurePackActiveCount = FEATURE_PACKS.filter((p) => isFeaturePackActive(p)).length;

  return (
    <FormPageShell title="Addons" manageHref="/admin/dashboard" manageLabel="Dashboard">
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {BUILTIN_ADDONS.length} built-in features included · {builtinConfiguredCount} configured ·{" "}
            {activeCount} of {internalCount} optional plugins active · {featurePackActiveCount} feature pack
            {featurePackActiveCount === 1 ? "" : "s"} licensed
          </p>
          <Link
            href="/admin/license/addon/add"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(90deg, #00c0ef, #3c8dbc)" }}
          >
            <span className="text-base leading-none">+</span>
            Add addon license
          </Link>
        </div>

        <section
          className="rounded-xl border p-4 space-y-3"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Configured on this panel</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                Live snapshot from panel settings, integrations, and licenses.
              </p>
            </div>
            <Link href="/admin/marketplace" className="text-xs underline" style={{ color: "var(--accent)" }}>
              Feature marketplace →
            </Link>
          </div>
          {configuredSummary.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: "var(--muted)" }}>
              No addons configured yet. Enable built-in features below or connect an integration.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {configuredSummary.map((item) =>
                item.href ? (
                  <Link
                    key={`${item.kind}-${item.name}`}
                    href={item.href}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:opacity-90"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    {item.name}
                    <span style={{ color: "var(--muted)" }}>({item.kind})</span>
                  </Link>
                ) : (
                  <span
                    key={`${item.kind}-${item.name}`}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    {item.name}
                    <span style={{ color: "var(--muted)" }}>({item.kind})</span>
                  </span>
                )
              )}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <SectionHeader
            title="Feature packs"
            action={
              <Link href="/admin/marketplace" className="text-xs underline" style={{ color: "var(--accent)" }}>
                View all packs
              </Link>
            }
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {FEATURE_PACKS.filter((p) => p.id !== "full_enterprise").map((pack) => (
              <Link key={pack.id} href={pack.settingsHref} className="block">
                <div
                  className="rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
                  style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm">{pack.name}</div>
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--muted)" }}>
                        {pack.tagline}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: isFeaturePackActive(pack) ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.15)",
                        color: isFeaturePackActive(pack) ? "#22c55e" : "var(--muted)",
                      }}
                    >
                      {isFeaturePackActive(pack) ? (panelSettings.general?.bundledFeaturePacks !== false ? "Included" : "Active") : "Configure"}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {builtinAddonsByCategory().map(({ category, items }) => (
          <section key={category} className="space-y-4">
            <SectionHeader title={`Built-in · ${category}`} />
            <div className="grid gap-4 lg:grid-cols-2">
              {items.map((p) => (
                <BuiltinPluginCard
                  key={p.id}
                  plugin={p}
                  configured={isBuiltinConfigured(p)}
                />
              ))}
            </div>
          </section>
        ))}

        <section className="space-y-4">
          <SectionHeader title="Internal plugins" />
          <div className="grid gap-4 lg:grid-cols-2">
            <PromoCard
              title="Custom plugin development"
              body="Need a bespoke integration or workflow? Nexlify can build internal plugins tailored to your panel."
              href="mailto:support@nexlify.live?subject=Custom%20panel%20plugin"
              hrefLabel="Contact us"
              external
            />
            {MEDIA_PLUGINS.map((p) => (
              <PluginCard key={p.id} plugin={p} configured={configuredIds.has(p.id)} />
            ))}
            {TOOL_PLUGINS.map((p) => (
              <PluginCard key={p.id} plugin={p} configured={configuredIds.has(p.id)} />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeader title="Music streaming" />
          <div className="grid gap-4 sm:grid-cols-2">
            {music.map((p) => (
              <PluginCard key={p.id} plugin={p} configured={configuredIds.has(p.id)} />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeader title="Third party" />
          <div className="grid gap-4 lg:grid-cols-2">
            <PromoCard
              title="Request a listing"
              body="Built a plugin for Nexlify panels? Send us details and we can feature it here."
              href="mailto:sales@nexlify.live?subject=Addon%20listing%20request"
              hrefLabel="Get in touch"
              external
            />
            {THIRD_PARTY.map((p) => (
              <PluginCard key={p.id} plugin={p} configured={false} />
            ))}
          </div>
        </section>

        <section
          className="rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          style={{ borderColor: "var(--border)", background: "rgba(0,192,239,0.06)" }}
        >
          <div>
            <div className="text-sm font-medium">Addon licenses</div>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              Keys from your Nexlify license or a manual addon key unlock plugins on this panel.
            </p>
          </div>
          <Link
            href="/admin/license/addon"
            className="text-sm font-medium underline-offset-2 hover:underline"
            style={{ color: "#00c0ef" }}
          >
            Manage licenses →
          </Link>
        </section>
      </div>
    </FormPageShell>
  );
}
