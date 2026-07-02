"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { NexlifyRelease } from "@/lib/panel-releases-feed";
import { isVersionNewer } from "@/lib/panel-releases-feed";

const SEEN_KEY = "nexlify-seen-release-version";
const SHOW_AFTER_UPDATE_KEY = "nexlify-show-release-notes";

function readSeenVersion(): string {
  try {
    return localStorage.getItem(SEEN_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function markSeen(version: string) {
  try {
    localStorage.setItem(SEEN_KEY, version.replace(/^v/i, ""));
  } catch {
    /* ignore */
  }
}

function readPendingVersion(): string {
  try {
    const v = sessionStorage.getItem(SHOW_AFTER_UPDATE_KEY)?.trim() ?? "";
    if (v) sessionStorage.removeItem(SHOW_AFTER_UPDATE_KEY);
    return v;
  } catch {
    return "";
  }
}

function pickRelease(
  installed: string,
  seen: string,
  pending: string,
  releases: NexlifyRelease[],
): NexlifyRelease | null {
  const normalized = installed.replace(/^v/i, "");
  if (pending) {
    const match = releases.find((r) => r.version.replace(/^v/i, "") === pending.replace(/^v/i, ""));
    if (match) return match;
  }
  const installedRelease = releases.find((r) => r.version.replace(/^v/i, "") === normalized);
  if (!installedRelease) return null;
  if (!seen) return installedRelease;
  if (isVersionNewer(normalized, seen)) return installedRelease;
  return null;
}

export function PanelReleaseNotesModal() {
  const [release, setRelease] = useState<NexlifyRelease | null>(null);
  const [installedVersion, setInstalledVersion] = useState("");

  const dismiss = useCallback(() => {
    if (installedVersion) markSeen(installedVersion);
    setRelease(null);
  }, [installedVersion]);

  useEffect(() => {
    const pending = readPendingVersion();
    const seen = readSeenVersion();

    Promise.all([
      fetch("/api/panel/version").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/panel-releases").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([versionPayload, feed]) => {
        const installed = String(versionPayload?.version ?? "").replace(/^v/i, "");
        if (!installed || !feed?.releases?.length) return;

        setInstalledVersion(installed);
        const match = pickRelease(installed, seen, pending, feed.releases);
        if (match) {
          setRelease({
            ...match,
            changelog: Array.isArray(match.changelog) ? match.changelog : [],
            fixes: Array.isArray(match.fixes) ? match.fixes : [],
            notes: Array.isArray(match.notes) ? match.notes : undefined,
          });
        } else if (pending) markSeen(installed);
      })
      .catch(() => {});
  }, []);

  if (!release) return null;

  const formatted = new Date(release.date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-[520] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="panel-release-notes-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
        aria-label="Close"
        onClick={dismiss}
      />
      <div
        className="relative flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <div
          className="shrink-0 border-b px-6 py-5"
          style={{
            borderColor: "var(--border)",
            background: "linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(99, 102, 241, 0.08))",
          }}
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "#38bdf8" }}>
            What&apos;s new
          </p>
          <h2
            id="panel-release-notes-title"
            className="mt-1 text-xl font-semibold"
            style={{ color: "var(--fg)" }}
          >
            v{release.version}
          </h2>
          {release.summary && (
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              {release.summary}
            </p>
          )}
          <time className="mt-2 block text-xs" style={{ color: "var(--muted)" }} dateTime={release.date}>
            {formatted}
          </time>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {release.notes && release.notes.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#38bdf8" }}>
                Notes
              </h3>
              <ul className="mt-2 space-y-2">
                {release.notes.map((note) => (
                  <li key={note} className="flex gap-2 text-sm" style={{ color: "var(--fg)" }}>
                    <span className="shrink-0 text-sky-400" aria-hidden>
                      ℹ
                    </span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(release.changelog) && release.changelog.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#22c55e" }}>
                Features
              </h3>
              <ul className="mt-2 space-y-2">
                {release.changelog.map((item) => (
                  <li key={item} className="flex gap-2 text-sm" style={{ color: "var(--fg)" }}>
                    <span className="shrink-0 text-emerald-400" aria-hidden>
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(release.fixes) && release.fixes.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#f87171" }}>
                Bug fixes
              </h3>
              <ul className="mt-2 space-y-2">
                {release.fixes.map((item) => (
                  <li key={item} className="flex gap-2 text-sm" style={{ color: "var(--fg)" }}>
                    <span className="shrink-0 text-red-400" aria-hidden>
                      ⓘ
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div
          className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <Link
            href="/admin/settings/updates"
            className="rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--border)", color: "var(--fg)" }}
            onClick={dismiss}
          >
            All updates
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer"
            style={{ background: "linear-gradient(135deg, #0ea5e9, #6366f1)" }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
