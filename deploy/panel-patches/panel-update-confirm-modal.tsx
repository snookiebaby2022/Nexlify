"use client";

export function PanelUpdateConfirmModal({
  open,
  targetVersion,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  targetVersion: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="panel-update-confirm-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm cursor-pointer"
        aria-label="Close"
        onClick={onCancel}
      />
      <div
        className="relative w-full max-w-md rounded-2xl border p-6 shadow-2xl"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/15 text-2xl">
          ⬆
        </div>
        <h2
          id="panel-update-confirm-title"
          className="text-center text-lg font-semibold"
          style={{ color: "var(--fg)" }}
        >
          Update to v{targetVersion}?
        </h2>
        <p className="mt-3 text-center text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          Your system will pull the latest code, install dependencies, migrate the database, and
          rebuild the panel. The app may be briefly unavailable. Back up your database first.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border px-5 py-2.5 text-sm font-medium cursor-pointer disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--fg)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}
          >
            {busy ? "Updating…" : "Confirm update"}
          </button>
        </div>
      </div>
    </div>
  );
}
