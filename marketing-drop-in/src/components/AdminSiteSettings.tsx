"use client";

import { useCallback, useEffect, useState } from "react";

type Settings = {
  maintenanceMode: boolean;
  siteTitle: string;
  siteDescription: string;
  supportEmail: string;
  salesEmail: string;
  telegramUrl: string;
  facebookUrl: string;
  twitterUrl: string;
  trustOperators: string;
  trustLines: string;
  trustCountries: string;
  customHtml: string;
};

export function AdminSiteSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then(setSettings)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const updated = await res.json();
        setSettings(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const update = (key: keyof Settings, value: string | boolean) => {
    setSettings((s) => s ? { ...s, [key]: value } : s);
  };

  if (loading) return <p className="text-slate-400 text-sm">Loading settings…</p>;
  if (!settings) return <p className="text-red-400 text-sm">Failed to load settings.</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-white">Site Settings</h2>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-400">Saved!</span>}
          <button onClick={save} disabled={saving} className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>

      <Section title="General">
        <Toggle label="Maintenance Mode" checked={settings.maintenanceMode} onChange={(v) => update("maintenanceMode", v)} description="Show a maintenance page to all non-admin visitors." />
        <Field label="Site Title" value={settings.siteTitle} onChange={(v) => update("siteTitle", v)} />
        <Field label="Site Description" value={settings.siteDescription} onChange={(v) => update("siteDescription", v)} textarea />
      </Section>

      <Section title="Contact">
        <Field label="Support Email" value={settings.supportEmail} onChange={(v) => update("supportEmail", v)} type="email" />
        <Field label="Sales Email" value={settings.salesEmail} onChange={(v) => update("salesEmail", v)} type="email" />
      </Section>

      <Section title="Social Links">
        <Field label="Telegram URL" value={settings.telegramUrl} onChange={(v) => update("telegramUrl", v)} placeholder="https://t.me/..." />
        <Field label="Facebook URL" value={settings.facebookUrl} onChange={(v) => update("facebookUrl", v)} placeholder="https://facebook.com/..." />
        <Field label="Twitter / X URL" value={settings.twitterUrl} onChange={(v) => update("twitterUrl", v)} placeholder="https://x.com/..." />
      </Section>

      <Section title="Trust Badges">
        <Field label="Operators Count" value={settings.trustOperators} onChange={(v) => update("trustOperators", v)} placeholder="e.g. 500" />
        <Field label="Active Lines" value={settings.trustLines} onChange={(v) => update("trustLines", v)} placeholder="e.g. 10,000" />
        <Field label="Countries" value={settings.trustCountries} onChange={(v) => update("trustCountries", v)} placeholder="e.g. 120" />
      </Section>

      <Section title="Custom HTML">
        <Field label="Injected HTML" value={settings.customHtml} onChange={(v) => update("customHtml", v)} textarea description="Custom HTML/JS injected into every page head (analytics scripts, chat widgets, etc.)." />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-2xl p-6">
      <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, type = "text", textarea, placeholder, description }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; textarea?: boolean; placeholder?: string; description?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-slate-300">{label}</label>
      {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none min-h-[80px]" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none" />
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm text-slate-300">{label}</p>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-violet-600" : "bg-slate-700"}`}>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform mt-0.5 ${checked ? "translate-x-5.5 ml-0.5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
