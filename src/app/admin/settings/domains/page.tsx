"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsPanel, SettingsSaveBar } from "@/components/settings-panel";
import type { PanelDomainsSettings } from "@/lib/domains";

const empty: PanelDomainsSettings = {
  primaryDomain: "",
  extraDomains: [],
  sslEnabled: false,
  forceHttps: false,
  fullSslEncryption: false,
  certbotEmail: "",
  certFullChainPath: "",
  certKeyPath: "",
  lastCertbotRun: null,
};

export default function DomainsSettingsPage() {
  const [data, setData] = useState<PanelDomainsSettings>(empty);
  const [newAlias, setNewAlias] = useState("");
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState("");
  const [envHint, setEnvHint] = useState("");
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/domains")
      .then((r) => r.json())
      .then((j) => setData({ ...empty, ...j.settings }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    setEnvHint("");
    const res = await fetch("/api/admin/domains", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const j = await res.json();
    setSaving(false);
    if (res.ok) {
      setData({ ...empty, ...j.settings });
      setEnvHint(j.envHint ?? "");
      setMsg("Domain settings saved.");
    } else {
      setMsg(j.error ?? "Save failed");
    }
  }

  function addAlias() {
    const d = newAlias.trim().toLowerCase();
    if (!d) return;
    if (data.extraDomains.includes(d) || d === data.primaryDomain) return;
    setData({ ...data, extraDomains: [...data.extraDomains, d] });
    setNewAlias("");
  }

  function removeAlias(domain: string) {
    setData({ ...data, extraDomains: data.extraDomains.filter((x) => x !== domain) });
  }

  async function issueCert() {
    setIssuing(true);
    setMsg("");
    const res = await fetch("/api/admin/domains/certbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.certbotEmail, agreeToTerms: agree }),
    });
    const j = await res.json();
    setIssuing(false);
    if (j.settings) setData({ ...empty, ...j.settings });
    setMsg(j.ok ? j.message : j.error ?? j.message);
  }

  const certNames = [
    data.primaryDomain,
    ...data.extraDomains.filter((d) => d !== data.primaryDomain),
  ].filter(Boolean);

  return (
    <form onSubmit={save} className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold">Domains &amp; SSL</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Primary hostname and aliases for the admin and reseller panels. Applies to{" "}
          <code className="font-mono text-xs">/admin</code> and{" "}
          <code className="font-mono text-xs">/reseller</code> on the same host.
        </p>
      </div>

      <SettingsPanel
        title="Panel domains"
        info="Resellers see the canonical URL on their profile. Point DNS A/AAAA records for every hostname to this VPS."
      >
        <div className="w-full space-y-4">
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Primary domain</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
              style={{ borderColor: "var(--border)" }}
              placeholder="panel.example.com"
              value={data.primaryDomain}
              onChange={(e) => setData({ ...data, primaryDomain: e.target.value })}
            />
          </label>

          <div className="text-sm">
            <span style={{ color: "var(--muted)" }}>Additional domains (aliases)</span>
            <ul className="mt-2 space-y-2">
              {data.extraDomains.map((d) => (
                <li
                  key={d}
                  className="flex items-center justify-between rounded border px-3 py-2"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="font-mono text-xs">{d}</span>
                  <button
                    type="button"
                    onClick={() => removeAlias(d)}
                    className="text-xs cursor-pointer"
                    style={{ color: "var(--danger)" }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-2">
              <input
                className="flex-1 rounded border px-3 py-2 bg-transparent text-sm"
                style={{ borderColor: "var(--border)" }}
                placeholder="alias.example.com"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAlias();
                  }
                }}
              />
              <button
                type="button"
                onClick={addAlias}
                className="rounded px-4 py-2 text-sm cursor-pointer border shrink-0"
                style={{ borderColor: "var(--border)" }}
              >
                Add domain
              </button>
            </div>
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="HTTPS"
        info="Force HTTPS redirects visitors to TLS when enabled. Issue a certificate below, then configure nginx with the cert paths."
      >
        <div className="grid md:grid-cols-2 gap-4 w-full">
          <label
            className="flex items-center gap-2 text-sm cursor-pointer md:col-span-2 p-3 rounded border"
            style={{ borderColor: "var(--accent)", background: "rgba(94,184,232,0.08)" }}
          >
            <input
              type="checkbox"
              checked={data.fullSslEncryption}
              onChange={(e) =>
                setData({
                  ...data,
                  fullSslEncryption: e.target.checked,
                  ...(e.target.checked ? { sslEnabled: true, forceHttps: true } : {}),
                })
              }
            />
            <span>
              <strong>Full SSL encryption</strong> — force HTTPS, enable SSL, and send HSTS headers
              (can turn off anytime)
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={data.sslEnabled}
              disabled={data.fullSslEncryption}
              onChange={(e) => setData({ ...data, sslEnabled: e.target.checked })}
            />
            SSL certificate active
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={data.forceHttps}
              onChange={(e) => setData({ ...data, forceHttps: e.target.checked })}
            />
            Force HTTPS (redirect HTTP)
          </label>
          <label className="block text-sm md:col-span-2">
            <span style={{ color: "var(--muted)" }}>Certificate full chain path</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm font-mono"
              style={{ borderColor: "var(--border)" }}
              value={data.certFullChainPath}
              onChange={(e) => setData({ ...data, certFullChainPath: e.target.value })}
              placeholder="/etc/letsencrypt/live/panel.example.com/fullchain.pem"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span style={{ color: "var(--muted)" }}>Certificate private key path</span>
            <input
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm font-mono"
              style={{ borderColor: "var(--border)" }}
              value={data.certKeyPath}
              onChange={(e) => setData({ ...data, certKeyPath: e.target.value })}
              placeholder="/etc/letsencrypt/live/panel.example.com/privkey.pem"
            />
          </label>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Let's Encrypt"
        info="Runs certbot on this Linux VPS using the path from Server binaries. On Windows dev, use manual certbot steps in deployment notes."
      >
        <div className="w-full space-y-4">
          <label className="block text-sm">
            <span style={{ color: "var(--muted)" }}>Contact email</span>
            <input
              type="email"
              className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
              style={{ borderColor: "var(--border)" }}
              value={data.certbotEmail}
              onChange={(e) => setData({ ...data, certbotEmail: e.target.value })}
            />
          </label>
          <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>
            Domains in certificate: {certNames.length ? certNames.join(", ") : "(none — set primary domain)"}
          </p>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span>
              I agree to the{" "}
              <a
                href="https://letsencrypt.org/documents/LE-SA-v1.4-April-3-2024.pdf"
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--accent)" }}
              >
                Let&apos;s Encrypt Subscriber Agreement
              </a>
            </span>
          </label>
          <button
            type="button"
            disabled={issuing || !agree || certNames.length === 0}
            onClick={issueCert}
            className="rounded px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {issuing ? "Running certbot…" : "Issue / renew certificate"}
          </button>
          {data.lastCertbotRun && (
            <div
              className="rounded border p-3 text-xs space-y-1"
              style={{
                borderColor: "var(--border)",
                color: data.lastCertbotRun.ok ? "var(--success)" : "var(--danger)",
              }}
            >
              <div>
                Last run: {new Date(data.lastCertbotRun.at).toLocaleString()} —{" "}
                {data.lastCertbotRun.ok ? "OK" : "Failed"}
              </div>
              <div>{data.lastCertbotRun.message}</div>
            </div>
          )}
        </div>
      </SettingsPanel>

      {envHint && (
        <p className="text-xs rounded border p-3" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          {envHint}
        </p>
      )}

      <SettingsSaveBar saving={saving} msg={msg} />
    </form>
  );
}
