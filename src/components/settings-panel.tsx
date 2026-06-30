"use client";

export function SettingsPanel({
  title,
  description,
  info,
  children,
}: {
  title: string;
  description?: string;
  info?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div
        className="px-4 py-2.5 text-sm font-semibold border-b"
        style={{
          borderColor: "var(--border)",
          background:
            "linear-gradient(180deg, rgba(94,184,232,0.25) 0%, rgba(94,184,232,0.08) 100%)",
          color: "#e8f4f8",
        }}
      >
        {title}
      </div>
      <div className="p-4 flex flex-col lg:flex-row gap-4">
        <div className="flex-1">{children}</div>
        {info && (
          <div
            className="lg:w-64 shrink-0 rounded border px-3 py-2 text-xs leading-relaxed"
            style={{
              borderColor: "rgba(94,184,232,0.35)",
              background: "rgba(94,184,232,0.08)",
              color: "var(--muted)",
            }}
          >
            {info}
          </div>
        )}
      </div>
      {description && (
        <p className="px-4 pb-3 text-xs" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      )}
    </section>
  );
}

export function SettingsSaveBar({
  saving,
  msg,
  children,
}: {
  saving?: boolean;
  msg?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="sticky bottom-0 z-10 flex flex-wrap items-center justify-center gap-4 py-3 mt-8 -mx-1 px-4 border-t rounded-b-lg"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-card)",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.12)",
      }}
    >
      <button
        type="submit"
        disabled={saving}
        className="btn-positive rounded px-8 py-2.5 font-medium cursor-pointer disabled:opacity-50 min-w-[140px]"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      {children}
      {msg && (
        <span
          className="text-sm"
          style={{
            color: msg.toLowerCase().includes("success") || msg === "Saved"
              ? "var(--success)"
              : "var(--danger)",
          }}
        >
          {msg}
        </span>
      )}
    </div>
  );
}
