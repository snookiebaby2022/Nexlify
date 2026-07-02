"use client";

import { useCallback, useId, useState } from "react";

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string>) => void };
  }
}

export function trackGrowth(event: string, data?: Record<string, string>) {
  if (typeof window !== "undefined") window.umami?.track(event, data);
}

type CopyLinkButtonProps = {
  href: string;
  label: string;
};

export function CopyLinkButton({ href, label }: CopyLinkButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const statusId = useId();

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(href);
      trackGrowth("link_copy", { label, href });
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 3000);
    }
  }, [href, label]);

  const statusText =
    status === "copied"
      ? "Link copied to clipboard"
      : status === "error"
        ? "Copy failed. Select the URL and copy manually."
        : "";

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="growth-btn-secondary text-xs"
        aria-describedby={status !== "idle" ? statusId : undefined}
        aria-label={`Copy ${label} link to clipboard`}
      >
        {status === "copied" ? "Copied" : status === "error" ? "Copy failed" : "Copy link"}
      </button>
      <span id={statusId} role="status" aria-live="polite" className="growth-sr-only">
        {statusText}
      </span>
    </>
  );
}
