"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { restartStreamOnServer } from "@/lib/restart-stream";
import { adminToast } from "@/lib/admin-toast";

export function RestartStreamModal({
  open,
  streamId,
  serverId,
  streamName,
  currentUrl,
  onClose,
  onDone,
}: {
  open: boolean;
  streamId: string;
  serverId: string;
  streamName?: string;
  currentUrl?: string | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [newUrl, setNewUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNewUrl("");
    setBusy(false);
  }, [open, streamId]);

  if (!open) return null;

  const title = streamName?.trim() ? `Restart — ${streamName.trim()}` : "Restart stream";
  const trimmedNew = newUrl.trim();
  const willReplace = Boolean(trimmedNew);

  async function confirm() {
    if (!serverId) {
      adminToast("No streaming server assigned to this channel.", "error");
      return;
    }
    setBusy(true);
    adminToast(
      willReplace ? "Saving new source and restarting…" : "Restarting stream…",
      "info",
      3500
    );
    try {
      const err = await restartStreamOnServer(serverId, streamId, {
        sourceUrl: willReplace ? trimmedNew : undefined,
      });
      if (err) {
        adminToast(err, "error");
        return;
      }
      adminToast(
        willReplace
          ? "New source saved — edge fan dropped; viewers will pull the new link"
          : "Stream restart queued — edge fan dropped",
        "success",
        4500
      );
      onDone?.();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[520] flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restart-stream-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
        aria-label="Close"
        disabled={busy}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--fg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 pt-8 pb-4 sm:px-10 sm:pt-10">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
            <RotateCcw size={32} strokeWidth={2.25} />
          </div>
          <h2 id="restart-stream-title" className="text-center text-2xl sm:text-3xl font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mt-4 text-center text-base sm:text-lg leading-relaxed max-w-2xl mx-auto" style={{ color: "var(--muted)" }}>
            Viewers will reconnect. The edge live fan is torn down and the channel re-auths against the
            current (or new) source URL so playback does not stick on the old upstream.
          </p>
        </div>

        <div className="px-8 sm:px-10 space-y-5">
          {currentUrl?.trim() ? (
            <div>
              <label className="block text-sm sm:text-base font-medium mb-2" style={{ color: "var(--muted)" }}>
                Current source
              </label>
              <div
                className="rounded-xl border px-4 py-3 text-sm sm:text-base font-mono break-all leading-relaxed"
                style={{ borderColor: "var(--border)", background: "var(--bg)" }}
              >
                {currentUrl.trim()}
              </div>
            </div>
          ) : null}

          <div>
            <label htmlFor="restart-new-source" className="block text-sm sm:text-base font-medium mb-2">
              New source link <span style={{ color: "var(--muted)" }}>(optional)</span>
            </label>
            <textarea
              id="restart-new-source"
              rows={3}
              disabled={busy}
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="Paste a new http(s) / m3u8 / TS URL to replace the source, then restart…"
              className="w-full rounded-xl border px-4 py-3 text-base sm:text-lg font-mono leading-relaxed resize-y min-h-[6.5rem] disabled:opacity-60"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--fg)" }}
            />
            <p className="mt-2 text-sm sm:text-base leading-relaxed" style={{ color: "var(--muted)" }}>
              {willReplace
                ? "This URL will be saved on the channel, then the live fan and auth cache are cleared so the edge pulls the new link."
                : "Leave blank to restart with the existing source URL."}
            </p>
          </div>
        </div>

        <div className="mt-8 px-8 sm:px-10 pb-8 sm:pb-10 flex flex-col-reverse sm:flex-row justify-center gap-3 sm:gap-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border px-8 py-3.5 text-base sm:text-lg font-medium cursor-pointer disabled:opacity-50 min-w-[10rem]"
            style={{ borderColor: "var(--border)", color: "var(--fg)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="rounded-xl px-8 py-3.5 text-base sm:text-lg font-semibold text-white cursor-pointer disabled:opacity-50 min-w-[14rem]"
            style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}
          >
            {busy
              ? willReplace
                ? "Saving & restarting…"
                : "Restarting…"
              : willReplace
                ? "Save link & restart"
                : "Restart stream"}
          </button>
        </div>
      </div>
    </div>
  );
}
