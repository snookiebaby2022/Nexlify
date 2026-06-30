"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Flag, ImagePlus, X } from "lucide-react";

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PanelSidebarReport() {
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  function clearImages() {
    setImages((prev) => {
      for (const img of prev) URL.revokeObjectURL(img.previewUrl);
      return [];
    });
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  }

  function addImages(files: FileList | null) {
    if (!files?.length) return;
    setError("");

    const next: PendingImage[] = [];
    const slotsLeft = MAX_IMAGES - images.length;

    for (const file of Array.from(files)) {
      if (next.length >= slotsLeft) {
        setError(`You can attach up to ${MAX_IMAGES} images.`);
        break;
      }
      if (!file.type.startsWith("image/")) {
        setError("Only image files are allowed (JPEG, PNG, GIF, WebP).");
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError(`Each image must be ${formatBytes(MAX_IMAGE_BYTES)} or smaller.`);
        continue;
      }
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (next.length > 0) setImages((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function sendReport() {
    const description = note.trim();
    if (!description) {
      setError("Please describe the issue before sending.");
      return;
    }

    setBusy(true);
    setMsg("");
    setError("");
    try {
      // Create a support ticket for the report
      const ticketRes = await fetch("/api/admin/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `Panel issue reported on ${pathname ?? "/"}`,
          body: description,
          priority: "HIGH",
          category: "REPORT",
        }),
      });
      const ticketData = await ticketRes.json();
      if (!ticketRes.ok) {
        setError(ticketData.error ?? "Could not create ticket");
        setBusy(false);
        return;
      }

      // Also send the detailed panel report with screenshots
      const form = new FormData();
      form.append("note", description);
      form.append("page", pathname ?? "/");
      form.append("ticketId", ticketData.ticket?.id ?? "");
      for (const img of images) {
        form.append("images", img.file, img.file.name);
      }

      const res = await fetch("/api/admin/panel-report", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send report");
        return;
      }
      setMsg(`Report sent to ${data.to} and ticket #${ticketData.ticket?.id?.slice(0, 8)} created`);
      setNote("");
      clearImages();
      setTimeout(() => {
        setOpen(false);
        setMsg("");
      }, 2200);
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMsg("");
          setError("");
        }}
        className="panel-sidebar-report-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
        title="Report an issue with screenshots"
      >
        <Flag size={18} className="shrink-0" style={{ color: "#fbbf24" }} />
        <span className="truncate">Report</span>
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[500] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="panel-report-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/55 backdrop-blur-sm cursor-pointer"
              aria-label="Close"
              onClick={() => !busy && setOpen(false)}
            />
            <div
              className="relative w-full max-w-md rounded-2xl border p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
            >
              <h2 id="panel-report-title" className="text-lg font-semibold" style={{ color: "var(--text)" }}>
                Report an issue
              </h2>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                Upload screenshots and describe what went wrong. We&apos;ll email your report to the panel owner with
                basic panel context attached.
              </p>

              <label
                className="mt-4 block text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                Describe the issue
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                maxLength={4000}
                disabled={busy}
                placeholder="What happened? Include steps to reproduce if you can."
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm resize-y min-h-[5rem]"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    Screenshots
                  </label>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {images.length}/{MAX_IMAGES} · max {formatBytes(MAX_IMAGE_BYTES)} each
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,image/*"
                  multiple
                  disabled={busy || images.length >= MAX_IMAGES}
                  className="sr-only"
                  onChange={(e) => addImages(e.target.files)}
                />
                <button
                  type="button"
                  disabled={busy || images.length >= MAX_IMAGES}
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm cursor-pointer disabled:opacity-50"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                >
                  <ImagePlus size={16} />
                  {images.length >= MAX_IMAGES ? "Maximum images attached" : "Add screenshots"}
                </button>

                {images.length > 0 && (
                  <ul className="mt-3 grid grid-cols-3 gap-2">
                    {images.map((img) => (
                      <li key={img.id} className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.previewUrl}
                          alt={img.file.name}
                          className="h-20 w-full rounded-lg border object-cover"
                          style={{ borderColor: "var(--border)" }}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeImage(img.id)}
                          className="absolute top-1 right-1 rounded-full p-0.5 cursor-pointer opacity-90 hover:opacity-100 disabled:opacity-50"
                          style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}
                          aria-label={`Remove ${img.file.name}`}
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {error && (
                <p
                  className="mt-3 text-sm rounded-lg border px-3 py-2"
                  style={{ borderColor: "var(--border)", color: "var(--danger)" }}
                >
                  {error}
                </p>
              )}
              {msg && (
                <p
                  className="mt-3 text-sm rounded-lg border px-3 py-2"
                  style={{ borderColor: "var(--border)", color: "var(--success)" }}
                >
                  {msg}
                </p>
              )}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                  className="rounded-lg border px-4 py-2 text-sm cursor-pointer disabled:opacity-50"
                  style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--bg)" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !note.trim()}
                  onClick={sendReport}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
                >
                  {busy ? "Sending…" : "Send report"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
