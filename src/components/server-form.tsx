"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FormField,
  FormPageShell,
  formInputClass,
  formInputStyle,
  formSelectClass,
} from "@/components/form-page-shell";
import { ServerAgentPanel } from "@/components/server-agent-panel";
import { IpWithFlag } from "@/components/ip-with-flag";
import {
  PANEL_HTTP_PORT,
  STREAM_HTTP_PORT,
  STREAM_HTTPS_PORT,
} from "@/lib/server-ports";
import {
  buildServerPanelSettingsJson,
  defaultAdvancedSettings,
  defaultNetworkSettings,
  defaultPerformanceSettings,
  defaultSslSettings,
  parseServerPanelSettings,
} from "@/lib/server-panel-settings";
import {
  Globe,
  Gauge,
  Lock,
  Network,
  Server,
  Settings2,
  Info,
} from "lucide-react";

type TabId = "details" | "domains" | "network" | "advanced" | "performance" | "ssl";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "details", label: "Details", icon: <Server size={16} /> },
  { id: "domains", label: "Domains", icon: <Globe size={16} /> },
  { id: "network", label: "Network", icon: <Network size={16} /> },
  { id: "advanced", label: "Advanced", icon: <Settings2 size={16} /> },
  { id: "performance", label: "Performance", icon: <Gauge size={16} /> },
  { id: "ssl", label: "SSL Certificate", icon: <Lock size={16} /> },
];

function parseList(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function listToText(v: unknown): string {
  if (!v || !Array.isArray(v)) return "";
  return v.map(String).join("\n");
}

export type ServerFormState = {
  name: string;
  host: string;
  privateIp: string;
  domain: string;
  port: number;
  httpsPort: number;
  panelPort: number;
  protocol: string;
  maxClients: number;
  proxyId: string;
  rtmpPort: string;
  bandwidthMbps: string;
  timeshiftOnly: boolean;
  isActive: boolean;
  proxied: boolean;
  agentUseSsh: boolean;
  agentSshHost: string;
  agentSshPort: number;
  agentSshUser: string;
  geoLbCountries: string;
  geoLbIsps: string;
  dnsRotatorHosts: string;
  dnsRotatorMode: "round_robin" | "random";
  attachPanelSettings: boolean;
  netInterface: string;
  netGateway: string;
  netSubnetMask: string;
  netDns: string;
  netMtu: number;
  netIpv6: boolean;
  perfCpuThreads: number;
  perfMaxConnections: number;
  perfIoReadMbps: number;
  perfIoWriteMbps: number;
  perfBufferMb: number;
  perfTimeshiftBuffer: boolean;
  sortOrder: number;
  healthStatus: string;
  healthMessage: string;
  perfSysctlConf: string;
  advDisableDiskRam: boolean;
  advServerRole: "main" | "lb" | "standard";
  sslAutoCertbot: boolean;
  sslCertbotEmail: string;
};

export const defaultServerForm = (): ServerFormState => ({
  name: "",
  host: "",
  privateIp: "",
  domain: "",
  port: STREAM_HTTP_PORT,
  httpsPort: STREAM_HTTPS_PORT,
  panelPort: PANEL_HTTP_PORT,
  protocol: "http",
  maxClients: 1000,
  proxyId: "",
  rtmpPort: "",
  bandwidthMbps: "",
  timeshiftOnly: false,
  isActive: true,
  proxied: false,
  agentUseSsh: false,
  agentSshHost: "",
  agentSshPort: 22,
  agentSshUser: "root",
  geoLbCountries: "",
  geoLbIsps: "",
  dnsRotatorHosts: "",
  dnsRotatorMode: "round_robin",
  attachPanelSettings: false,
  ...(() => {
    const n = defaultNetworkSettings();
    const p = defaultPerformanceSettings();
    const a = defaultAdvancedSettings();
    const ssl = defaultSslSettings();
    return {
      netInterface: n.interfaceName,
      netGateway: n.gateway,
      netSubnetMask: n.subnetMask,
      netDns: n.dnsServers,
      netMtu: n.mtu,
      netIpv6: n.ipv6Enabled,
      perfCpuThreads: p.cpuThreads,
      perfMaxConnections: p.maxConnections,
      perfIoReadMbps: p.ioReadMbps,
      perfIoWriteMbps: p.ioWriteMbps,
      perfBufferMb: p.bufferSizeMb,
      perfTimeshiftBuffer: p.enableTimeshiftBuffer,
      sortOrder: p.sortOrder,
      healthStatus: "unknown",
      healthMessage: "",
      perfSysctlConf: p.sysctlConf,
      advDisableDiskRam: a.disableDiskRam,
      advServerRole: a.serverRole,
      sslAutoCertbot: ssl.autoCertbot,
      sslCertbotEmail: ssl.certbotEmail,
    };
  })(),
});

function InfoTip({ title }: { title: string }) {
  return (
    <span
      className="inline-flex ml-1 align-middle cursor-help"
      title={title}
      style={{ color: "var(--muted)" }}
    >
      <Info size={14} />
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
      <span className="text-sm font-medium flex items-center">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative w-12 h-6 rounded-full transition-colors shrink-0"
        style={{
          background: checked ? "#3c8dbc" : "#d1d5db",
        }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
          style={{ left: checked ? "1.5rem" : "0.125rem" }}
        />
      </button>
    </label>
  );
}

function serverToForm(s: Record<string, unknown>): ServerFormState {
  const dns = s.dnsRotator as { mode?: string; hosts?: string[] } | null;
  const { network, performance, advanced, ssl } = parseServerPanelSettings(s.panelSettings);
  const base = defaultServerForm();
  return {
    ...base,
    name: String(s.name ?? ""),
    host: String(s.host ?? ""),
    privateIp: String(s.privateIp ?? ""),
    domain: String(s.domain ?? ""),
    port: Number(s.port ?? STREAM_HTTP_PORT),
    httpsPort: Number(s.httpsPort ?? STREAM_HTTPS_PORT),
    panelPort: Number(s.panelPort ?? PANEL_HTTP_PORT),
    protocol: String(s.protocol ?? "http"),
    maxClients: Number(s.maxClients ?? 1000),
    proxyId: s.proxyId ? String(s.proxyId) : "",
    rtmpPort: s.rtmpPort != null ? String(s.rtmpPort) : "",
    bandwidthMbps: s.bandwidthMbps != null ? String(s.bandwidthMbps) : "",
    timeshiftOnly: Boolean(s.timeshiftOnly),
    isActive: Boolean(s.isActive !== false),
    proxied: Boolean(s.proxyId),
    agentUseSsh: Boolean(s.agentUseSsh),
    agentSshHost: String(s.agentSshHost ?? ""),
    agentSshPort: Number(s.agentSshPort ?? 22),
    agentSshUser: String(s.agentSshUser ?? "root"),
    geoLbCountries: listToText(s.geoLbCountries),
    geoLbIsps: listToText(s.geoLbIsps),
    dnsRotatorHosts: dns?.hosts?.join("\n") ?? "",
    dnsRotatorMode: dns?.mode === "random" ? "random" : "round_robin",
    attachPanelSettings: false,
    netInterface: network.interfaceName,
    netGateway: network.gateway,
    netSubnetMask: network.subnetMask,
    netDns: network.dnsServers,
    netMtu: network.mtu,
    netIpv6: network.ipv6Enabled,
    perfCpuThreads: performance.cpuThreads,
    perfMaxConnections: performance.maxConnections || Number(s.maxClients ?? 1000),
    perfIoReadMbps: performance.ioReadMbps,
    perfIoWriteMbps: performance.ioWriteMbps,
    perfBufferMb: performance.bufferSizeMb,
    perfTimeshiftBuffer: performance.enableTimeshiftBuffer,
    sortOrder: Number(s.sortOrder ?? performance.sortOrder ?? 0),
    healthStatus: String(s.healthStatus ?? "unknown"),
    healthMessage: String(s.healthMessage ?? ""),
    perfSysctlConf: performance.sysctlConf ?? "",
    advDisableDiskRam: advanced.disableDiskRam,
    advServerRole: advanced.serverRole ?? "standard",
    sslAutoCertbot: ssl.autoCertbot,
    sslCertbotEmail: ssl.certbotEmail,
  };
}

function buildPayload(form: ServerFormState, panelSettings: object | null) {
  const hosts = parseList(form.dnsRotatorHosts);
  const dnsRotator = hosts.length ? { mode: form.dnsRotatorMode, hosts } : null;
  const maxClients = form.perfMaxConnections > 0 ? form.perfMaxConnections : form.maxClients;
  return {
    name: form.name,
    host: form.host,
    privateIp: form.privateIp || null,
    domain: form.domain || null,
    port: form.port,
    httpsPort: form.httpsPort,
    panelPort: form.panelPort,
    protocol: form.protocol,
    maxClients,
    sortOrder: form.sortOrder,
    isActive: form.isActive,
    timeshiftOnly: form.timeshiftOnly,
    proxyId: form.proxied ? form.proxyId || null : null,
    rtmpPort: form.rtmpPort ? Number(form.rtmpPort) : null,
    bandwidthMbps: form.bandwidthMbps ? Number(form.bandwidthMbps) : null,
    agentUseSsh: form.agentUseSsh,
    agentSshHost: form.agentUseSsh ? form.agentSshHost || form.host : null,
    agentSshPort: form.agentUseSsh ? form.agentSshPort : null,
    agentSshUser: form.agentUseSsh ? form.agentSshUser : null,
    geoLbCountries: (() => {
      const c = parseList(form.geoLbCountries);
      return c.length ? c : null;
    })(),
    geoLbIsps: (() => {
      const c = parseList(form.geoLbIsps);
      return c.length ? c : null;
    })(),
    dnsRotator,
    panelSettings,
  };
}

export function ServerForm({
  mode,
  serverId,
  title,
  manageHref,
  manageLabel,
}: {
  mode: "create" | "edit";
  serverId?: string;
  title: string;
  manageHref: string;
  manageLabel?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("details");
  const [form, setForm] = useState<ServerFormState>(defaultServerForm);
  const [proxies, setProxies] = useState<{ id: string; name: string }[]>([]);
  const [panelSummary, setPanelSummary] = useState<{
    panelName: string;
    panelUrl: string;
    panelPort: number;
    panelSslPort: number;
    autoChannelLogos: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [existingPanelSettings, setExistingPanelSettings] = useState<unknown>(null);
  const [certbotMsg, setCertbotMsg] = useState("");
  const [certbotBusy, setCertbotBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/proxies")
      .then((r) => r.json())
      .then((d) => setProxies(d.proxies ?? []));
    Promise.all([
      fetch("/api/admin/settings?group=general").then((r) => r.json()),
      fetch("/api/admin/settings?group=server").then((r) => r.json()),
      fetch("/api/admin/settings?group=streams").then((r) => r.json()),
    ]).then(([g, s, st]) => {
      setPanelSummary({
        panelName: String(g.settings?.panelName ?? "Nexlify"),
        panelUrl: String(g.settings?.panelUrl ?? ""),
        panelPort: Number(s.settings?.panelPort ?? PANEL_HTTP_PORT),
        panelSslPort: Number(s.settings?.panelSslPort ?? STREAM_HTTPS_PORT),
        autoChannelLogos: Boolean(st.settings?.autoChannelLogos),
      });
    });
    if (mode === "edit" && serverId) {
      fetch(`/api/admin/servers/${serverId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.server) {
            setForm(serverToForm(d.server));
            setExistingPanelSettings(d.server.panelSettings ?? null);
          }
          setLoading(false);
        });
    }
  }, [mode, serverId]);

  function nextTab() {
    const idx = TABS.findIndex((t) => t.id === tab);
    if (idx < TABS.length - 1) setTab(TABS[idx + 1].id);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const snapshot =
      form.attachPanelSettings && panelSummary
        ? {
            panelName: panelSummary.panelName,
            panelUrl: panelSummary.panelUrl,
            panelPort: form.panelPort,
            panelSslPort: form.httpsPort,
            autoChannelLogos: panelSummary.autoChannelLogos,
          }
        : null;

    const panelSettings = buildServerPanelSettingsJson(
      existingPanelSettings,
      {
        network: {
          interfaceName: form.netInterface.trim() || "eth0",
          gateway: form.netGateway.trim(),
          subnetMask: form.netSubnetMask.trim() || "255.255.255.0",
          dnsServers: form.netDns,
          mtu: form.netMtu || 1500,
          ipv6Enabled: form.netIpv6,
        },
        performance: {
          cpuThreads: form.perfCpuThreads,
          maxConnections: form.perfMaxConnections || form.maxClients,
          ioReadMbps: form.perfIoReadMbps,
          ioWriteMbps: form.perfIoWriteMbps,
          bufferSizeMb: form.perfBufferMb,
          enableTimeshiftBuffer: form.perfTimeshiftBuffer,
          sortOrder: form.sortOrder,
          sysctlConf: form.perfSysctlConf,
        },
        advanced: {
          disableDiskRam: form.advDisableDiskRam,
          serverRole: form.advServerRole,
        },
        ssl: {
          autoCertbot: form.sslAutoCertbot,
          certbotEmail: form.sslCertbotEmail.trim(),
        },
      },
      snapshot
    );

    const payload = buildPayload(form, panelSettings);

    if (mode === "create") {
      const res = await fetch("/api/admin/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaving(false);
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Failed to create server");
        return;
      }
      const data = await res.json();
      router.push(`/admin/servers/${data.server.id}/edit`);
      return;
    }

    const res = await fetch("/api/admin/servers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: serverId, ...payload }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Failed to save");
      return;
    }
    if (
      mode === "edit" &&
      serverId &&
      form.sslAutoCertbot &&
      form.domain.trim() &&
      form.sslCertbotEmail.trim()
    ) {
      const certRes = await fetch(`/api/admin/servers/${serverId}/certbot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.sslCertbotEmail, agreeToTerms: true }),
      });
      const certData = await certRes.json().catch(() => ({}));
      if (!certRes.ok) {
        alert(certData.error ?? certData.message ?? "Saved server but certbot failed");
      }
    }
    router.push("/admin/servers");
  }

  const viewUrl =
    form.host && form.isActive
      ? form.domain
        ? `https://${form.domain}:${form.httpsPort}`
        : `${form.protocol}://${form.host}:${form.port}`
      : null;

  if (loading) {
    return (
      <FormPageShell title={title} manageHref={manageHref} manageLabel={manageLabel}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Loading…
        </p>
      </FormPageShell>
    );
  }

  return (
    <form onSubmit={save} className="max-w-4xl panel-form-mobile-tight">
      <div
        className="flex items-center justify-between px-5 py-3.5 rounded-t-lg"
        style={{
          background: "linear-gradient(90deg, #00c0ef 0%, #3c8dbc 50%, #2a9fd6 100%)",
        }}
      >
        <h1 className="text-lg font-semibold text-white tracking-wide">{title}</h1>
        <div className="flex items-center gap-2">
          {viewUrl && (
            <a
              href={viewUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm px-4 py-1.5 rounded border border-white/80 text-white hover:bg-white/10"
            >
              View Server
            </a>
          )}
          <Link
            href={manageHref}
            className="text-sm px-4 py-1.5 rounded border border-white/80 text-white hover:bg-white/10"
          >
            {manageLabel ?? "Manage Servers"}
          </Link>
        </div>
      </div>

      <div
        className="border border-t-0 rounded-b-lg overflow-hidden"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div
          className="flex flex-wrap gap-0 border-b"
          style={{ borderColor: "var(--border)", background: "#f8fafc" }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer"
              style={{
                borderColor: tab === t.id ? "#3c8dbc" : "transparent",
                color: tab === t.id ? "#fff" : "#64748b",
                background: tab === t.id ? "#3c8dbc" : "transparent",
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6 md:p-8 space-y-4">
          {tab === "details" && (
            <div className="space-y-1 max-w-2xl">
              <FormField label="Server Name" required>
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </FormField>
              <FormField
                label="Server IP"
                required
              >
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  required
                />
                {form.host.trim() && (
                  <p className="mt-1.5">
                    <IpWithFlag ip={form.host} />
                  </p>
                )}
                <InfoTip title="Main server IP used for streaming and agent connections." />
              </FormField>
              <FormField label="Private IP">
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.privateIp}
                  onChange={(e) => setForm({ ...form, privateIp: e.target.value })}
                  placeholder="10.0.0.1"
                />
                {form.privateIp.trim() && (
                  <p className="mt-1.5">
                    <IpWithFlag ip={form.privateIp} />
                  </p>
                )}
              </FormField>
              <FormField label="Max Clients">
                <input
                  type="number"
                  className={`${formInputClass} max-w-[200px]`}
                  style={formInputStyle}
                  value={form.maxClients}
                  onChange={(e) =>
                    setForm({ ...form, maxClients: parseInt(e.target.value, 10) || 0 })
                  }
                />
              </FormField>
              <Toggle
                label="Timeshift Only"
                checked={form.timeshiftOnly}
                onChange={(timeshiftOnly) => setForm({ ...form, timeshiftOnly })}
              />
              <Toggle
                label="Enabled"
                checked={form.isActive}
                onChange={(isActive) => setForm({ ...form, isActive })}
              />
              <Toggle
                label="Proxied"
                checked={form.proxied}
                onChange={(proxied) =>
                  setForm({
                    ...form,
                    proxied,
                    proxyId: proxied && !form.proxyId && proxies[0] ? proxies[0].id : form.proxyId,
                  })
                }
              />
              {form.proxied && (
                <FormField label="Proxy">
                  <select
                    className={formSelectClass}
                    style={formInputStyle}
                    value={form.proxyId}
                    onChange={(e) => setForm({ ...form, proxyId: e.target.value })}
                  >
                    <option value="">Select proxy…</option>
                    {proxies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
              <p className="text-xs pt-2" style={{ color: "var(--muted)" }}>
                Streaming HTTP: <strong>{STREAM_HTTP_PORT}</strong> · Panel:{" "}
                <strong>{PANEL_HTTP_PORT}</strong> · HTTPS: <strong>{STREAM_HTTPS_PORT}</strong>
              </p>
            </div>
          )}

          {tab === "domains" && (
            <div className="space-y-4 max-w-2xl">
              <FormField label="Domain Name">
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  placeholder="stream.example.com"
                />
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  Shown under the server IP on Manage Servers when enabled.
                </p>
              </FormField>
              <FormField label="DNS rotator hosts (one per line)">
                <textarea
                  className={`${formInputClass} font-mono text-sm`}
                  style={formInputStyle}
                  rows={4}
                  value={form.dnsRotatorHosts}
                  onChange={(e) => setForm({ ...form, dnsRotatorHosts: e.target.value })}
                />
              </FormField>
              <FormField label="Rotator mode">
                <select
                  className={formSelectClass}
                  style={formInputStyle}
                  value={form.dnsRotatorMode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dnsRotatorMode: e.target.value as "round_robin" | "random",
                    })
                  }
                >
                  <option value="round_robin">Round robin</option>
                  <option value="random">Random</option>
                </select>
              </FormField>
            </div>
          )}

          {tab === "network" && (
            <div className="space-y-4 max-w-2xl">
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Configure how the panel and streaming agent bind to this host. Public and private IPs
                are set under Details.
              </p>
              <FormField label="Primary interface">
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.netInterface}
                  onChange={(e) => setForm({ ...form, netInterface: e.target.value })}
                  placeholder="eth0"
                />
              </FormField>
              <div className="grid sm:grid-cols-2 gap-3">
                <FormField label="Public IP (server)">
                  <input
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.host}
                    readOnly
                    title="Edit on Details tab"
                  />
                </FormField>
                <FormField label="Private IP">
                  <input
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.privateIp}
                    onChange={(e) => setForm({ ...form, privateIp: e.target.value })}
                    placeholder="10.0.0.1"
                  />
                </FormField>
              </div>
              <FormField label="Default gateway">
                <input
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.netGateway}
                  onChange={(e) => setForm({ ...form, netGateway: e.target.value })}
                  placeholder="10.0.0.1"
                />
              </FormField>
              <FormField label="DNS servers (one per line)">
                <textarea
                  className={`${formInputClass} font-mono text-sm`}
                  style={formInputStyle}
                  rows={3}
                  value={form.netDns}
                  onChange={(e) => setForm({ ...form, netDns: e.target.value })}
                />
              </FormField>
              <FormField label="MTU">
                <input
                  type="number"
                  className={`${formInputClass} max-w-[200px]`}
                  style={formInputStyle}
                  value={form.netMtu}
                  onChange={(e) =>
                    setForm({ ...form, netMtu: parseInt(e.target.value, 10) || 1500 })
                  }
                />
              </FormField>
              <Toggle
                label="IPv6 enabled"
                checked={form.netIpv6}
                onChange={(netIpv6) => setForm({ ...form, netIpv6 })}
              />
            </div>
          )}

          {tab === "advanced" && (
            <div className="space-y-4 max-w-2xl">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <FormField label="Panel HTTP port">
                  <input
                    type="number"
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.panelPort}
                    onChange={(e) =>
                      setForm({ ...form, panelPort: parseInt(e.target.value, 10) || PANEL_HTTP_PORT })
                    }
                  />
                </FormField>
                <FormField label="Streaming HTTP port">
                  <input
                    type="number"
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.port}
                    onChange={(e) =>
                      setForm({ ...form, port: parseInt(e.target.value, 10) || STREAM_HTTP_PORT })
                    }
                  />
                </FormField>
                <FormField label="RTMP port">
                  <input
                    type="number"
                    className={formInputClass}
                    style={formInputStyle}
                    placeholder="1935"
                    value={form.rtmpPort}
                    onChange={(e) => setForm({ ...form, rtmpPort: e.target.value })}
                  />
                </FormField>
                <FormField label="Bandwidth cap (Mbps)">
                  <input
                    type="number"
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.bandwidthMbps}
                    onChange={(e) => setForm({ ...form, bandwidthMbps: e.target.value })}
                    placeholder="0 = unlimited"
                  />
                </FormField>
              </div>
              <Toggle
                label="SSH agent access"
                checked={form.agentUseSsh}
                onChange={(agentUseSsh) => setForm({ ...form, agentUseSsh })}
              />
              {form.agentUseSsh && (
                <div className="grid sm:grid-cols-3 gap-3">
                  <FormField label="SSH host">
                    <input
                      className={formInputClass}
                      style={formInputStyle}
                      value={form.agentSshHost}
                      onChange={(e) => setForm({ ...form, agentSshHost: e.target.value })}
                      placeholder={form.host}
                    />
                  </FormField>
                  <FormField label="SSH port">
                    <input
                      type="number"
                      className={formInputClass}
                      style={formInputStyle}
                      value={form.agentSshPort}
                      onChange={(e) =>
                        setForm({ ...form, agentSshPort: parseInt(e.target.value, 10) })
                      }
                    />
                  </FormField>
                  <FormField label="SSH user">
                    <input
                      className={formInputClass}
                      style={formInputStyle}
                      value={form.agentSshUser}
                      onChange={(e) => setForm({ ...form, agentSshUser: e.target.value })}
                    />
                  </FormField>
                </div>
              )}
              <FormField label="Geo LB — countries">
                <textarea
                  className={`${formInputClass} font-mono text-sm`}
                  style={formInputStyle}
                  rows={3}
                  value={form.geoLbCountries}
                  onChange={(e) => setForm({ ...form, geoLbCountries: e.target.value })}
                />
              </FormField>
              <FormField label="Geo LB — ISPs">
                <textarea
                  className={`${formInputClass} font-mono text-sm`}
                  style={formInputStyle}
                  rows={3}
                  value={form.geoLbIsps}
                  onChange={(e) => setForm({ ...form, geoLbIsps: e.target.value })}
                />
              </FormField>
              <FormField label="Server role">
                <select
                  className={formSelectClass}
                  style={formInputStyle}
                  value={form.advServerRole}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      advServerRole: e.target.value as "main" | "lb" | "standard",
                    })
                  }
                >
                  <option value="main">Main server</option>
                  <option value="lb">Load balancer (LB)</option>
                  <option value="standard">Standard</option>
                </select>
                <InfoTip title="Main is the primary panel/stream host; LB nodes handle geo-routed traffic." />
              </FormField>
              <Toggle
                label="Disable disk RAM cache"
                checked={form.advDisableDiskRam}
                onChange={(advDisableDiskRam) => setForm({ ...form, advDisableDiskRam })}
              />
              {mode === "edit" && serverId && (
                <div className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                  <ServerAgentPanel serverId={serverId} />
                </div>
              )}
            </div>
          )}

          {tab === "performance" && (
            <div className="space-y-4 max-w-2xl">
              {mode === "edit" && (
                <div
                  className="rounded-lg border px-4 py-3 text-sm"
                  style={{ borderColor: "var(--border)", background: "#f8fafc" }}
                >
                  <span className="font-medium">Health: </span>
                  <span className="capitalize">{form.healthStatus}</span>
                  {form.healthMessage ? (
                    <span style={{ color: "var(--muted)" }}> — {form.healthMessage}</span>
                  ) : null}
                </div>
              )}
              <FormField label="Sort order">
                <input
                  type="number"
                  className={`${formInputClass} max-w-[200px]`}
                  style={formInputStyle}
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm({ ...form, sortOrder: parseInt(e.target.value, 10) || 0 })
                  }
                />
                <InfoTip title="Lower numbers appear first on Manage Servers." />
              </FormField>
              <FormField label="Max concurrent connections">
                <input
                  type="number"
                  className={`${formInputClass} max-w-[200px]`}
                  style={formInputStyle}
                  value={form.perfMaxConnections}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      perfMaxConnections: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </FormField>
              <FormField label="FFmpeg / worker CPU threads">
                <input
                  type="number"
                  className={`${formInputClass} max-w-[200px]`}
                  style={formInputStyle}
                  value={form.perfCpuThreads}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      perfCpuThreads: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  placeholder="0 = auto"
                />
                <InfoTip title="0 lets the agent pick based on host CPU count." />
              </FormField>
              <div className="grid sm:grid-cols-2 gap-3">
                <FormField label="Disk read cap (Mbps)">
                  <input
                    type="number"
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.perfIoReadMbps}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        perfIoReadMbps: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    placeholder="0 = unlimited"
                  />
                </FormField>
                <FormField label="Disk write cap (Mbps)">
                  <input
                    type="number"
                    className={formInputClass}
                    style={formInputStyle}
                    value={form.perfIoWriteMbps}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        perfIoWriteMbps: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    placeholder="0 = unlimited"
                  />
                </FormField>
              </div>
              <FormField label="Stream buffer size (MB)">
                <input
                  type="number"
                  className={`${formInputClass} max-w-[200px]`}
                  style={formInputStyle}
                  value={form.perfBufferMb}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      perfBufferMb: parseInt(e.target.value, 10) || 64,
                    })
                  }
                />
              </FormField>
              <Toggle
                label="Dedicated timeshift buffer"
                checked={form.perfTimeshiftBuffer}
                onChange={(perfTimeshiftBuffer) => setForm({ ...form, perfTimeshiftBuffer })}
              />
              <FormField label="Custom sysctl.conf">
                <textarea
                  className={`${formInputClass} font-mono text-xs`}
                  style={formInputStyle}
                  rows={8}
                  placeholder="# Extra sysctl lines pushed to the stream agent&#10;net.core.rmem_max = 16777216"
                  value={form.perfSysctlConf}
                  onChange={(e) => setForm({ ...form, perfSysctlConf: e.target.value })}
                />
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  Optional lines merged into the agent sysctl configuration on deploy.
                </p>
              </FormField>
            </div>
          )}

          {tab === "ssl" && (
            <div className="space-y-4 max-w-2xl">
              <FormField label="HTTPS port">
                <input
                  type="number"
                  className={`${formInputClass} max-w-[200px]`}
                  style={formInputStyle}
                  value={form.httpsPort}
                  onChange={(e) =>
                    setForm({ ...form, httpsPort: parseInt(e.target.value, 10) || STREAM_HTTPS_PORT })
                  }
                />
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  All HTTPS traffic uses port {STREAM_HTTPS_PORT} by default.
                </p>
              </FormField>
              <FormField label="Protocol">
                <select
                  className={formSelectClass}
                  style={formInputStyle}
                  value={form.protocol}
                  onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                >
                  <option value="http">http</option>
                  <option value="https">https</option>
                </select>
              </FormField>
              <Toggle
                label="Auto-generate HTTPS certificate (Certbot)"
                checked={form.sslAutoCertbot}
                onChange={(sslAutoCertbot) => setForm({ ...form, sslAutoCertbot })}
              />
              <FormField label="Certbot email">
                <input
                  type="email"
                  className={formInputClass}
                  style={formInputStyle}
                  value={form.sslCertbotEmail}
                  onChange={(e) => setForm({ ...form, sslCertbotEmail: e.target.value })}
                  placeholder="admin@example.com"
                />
              </FormField>
              {mode === "edit" && serverId && (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={certbotBusy || !form.domain.trim()}
                    className="rounded px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
                    style={{ background: "#3c8dbc", color: "#fff" }}
                    onClick={async () => {
                      if (!form.domain.trim()) {
                        setCertbotMsg("Set a domain on the Domains tab first.");
                        return;
                      }
                      setCertbotBusy(true);
                      setCertbotMsg("");
                      const res = await fetch(`/api/admin/servers/${serverId}/certbot`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          email: form.sslCertbotEmail,
                          agreeToTerms: true,
                        }),
                      });
                      const data = await res.json();
                      setCertbotBusy(false);
                      setCertbotMsg(res.ok ? (data.message ?? "Certificate issued") : (data.error ?? data.message ?? "Failed"));
                      if (res.ok && data.ok) {
                        setForm((f) => ({ ...f, protocol: "https" }));
                      }
                    }}
                  >
                    {certbotBusy ? "Running certbot…" : "Issue certificate now"}
                  </button>
                  {!form.domain.trim() && (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      Add a domain name under Domains before issuing a certificate.
                    </p>
                  )}
                  {certbotMsg && (
                    <p className="text-xs" style={{ color: certbotMsg.includes("issued") || certbotMsg.includes("success") ? "var(--success)" : "var(--danger)" }}>
                      {certbotMsg}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className="flex justify-end gap-3 px-6 py-4 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          {tab !== "ssl" ? (
            <button
              type="button"
              className="rounded px-5 py-2 text-sm font-medium cursor-pointer"
              style={{ background: "#3c8dbc", color: "#fff" }}
              onClick={nextTab}
            >
              Next
            </button>
          ) : (
            <>
              <Link
                href={manageHref}
                className="btn-cancel rounded px-5 py-2 text-sm font-medium inline-flex items-center"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="btn-positive rounded px-5 py-2 text-sm font-medium cursor-pointer disabled:opacity-60"
              >
                {saving ? "Saving…" : mode === "create" ? "Create server" : "Save server"}
              </button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
