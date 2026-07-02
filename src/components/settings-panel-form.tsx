"use client";

import { useEffect, useState } from "react";
import type { SettingGroup } from "@/lib/panel-settings";
import { SettingsPanel, SettingsSaveBar } from "@/components/settings-panel";

export type SettingsField = {
  key: string;
  label: string;
  type?: "text" | "number" | "password" | "textarea" | "select" | "yesno";
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  colSpan?: 1 | 2 | 3;
};

export type SettingsSection = {
  title: string;
  description?: string;
  info?: string;
  fields: SettingsField[];
};

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="text-sm">
      <div className="mb-1.5" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={value} onChange={() => onChange(true)} />
          Yes
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={!value} onChange={() => onChange(false)} />
          No
        </label>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: SettingsField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "yesno") {
    return (
      <YesNo label={field.label} value={Boolean(value)} onChange={(v) => onChange(v)} />
    );
  }
  if (field.type === "select" && field.options) {
    return (
      <label className="block text-sm">
        <span style={{ color: "var(--muted)" }}>{field.label}</span>
        <select
          className="panel-select mt-1 w-full rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="block text-sm">
        <span style={{ color: "var(--muted)" }}>{field.label}</span>
        <textarea
          className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
          style={{ borderColor: "var(--border)" }}
          rows={3}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }
  return (
    <label className="block text-sm">
      <span style={{ color: "var(--muted)" }}>{field.label}</span>
      <input
        type={field.type === "number" ? "number" : field.type === "password" ? "password" : "text"}
        className="mt-1 w-full rounded border px-3 py-2 bg-transparent text-sm"
        style={{ borderColor: "var(--border)" }}
        placeholder={field.placeholder}
        value={String(value ?? "")}
        onChange={(e) =>
          onChange(field.type === "number" ? Number(e.target.value) : e.target.value)
        }
      />
    </label>
  );
}

export function SettingsPanelForm({
  group,
  title,
  description,
  sections,
  topContent,
  footerExtra,
}: {
  group: SettingGroup;
  title: string;
  description?: string;
  sections: SettingsSection[];
  topContent?: React.ReactNode;
  footerExtra?: React.ReactNode;
}) {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/settings?group=${group}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d.settings ?? {});
        setLoading(false);
      });
  }, [group]);

  function setKey(key: string, value: unknown) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group, settings: data }),
      });
      const j = await res.json();
      setMsg(res.ok ? "Settings saved successfully." : j.error ?? "Save failed");
    } catch {
      setMsg("Network error while saving");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading settings…</p>;
  }

  return (
    <form onSubmit={save} className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {description}
          </p>
        )}
      </div>

      {topContent}

      {sections.map((section) => (
        <SettingsPanel key={section.title} title={section.title} info={section.info} description={section.description}>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 w-full">
            {section.fields.map((f) => (
              <div
                key={f.key}
                className={
                  f.colSpan === 3 ? "md:col-span-2 xl:col-span-3" : f.colSpan === 2 ? "md:col-span-2" : ""
                }
              >
                <FieldInput field={f} value={data[f.key]} onChange={(v) => setKey(f.key, v)} />
                {f.hint && (
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    {f.hint}
                  </p>
                )}
              </div>
            ))}
          </div>
        </SettingsPanel>
      ))}

      <SettingsSaveBar saving={saving} msg={msg}>
        {footerExtra}
      </SettingsSaveBar>
    </form>
  );
}
