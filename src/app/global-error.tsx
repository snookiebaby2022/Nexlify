"use client";

import { useEffect } from "react";
import { reloadOnceForStaleChunks } from "@/lib/chunk-load-recovery";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (reloadOnceForStaleChunks(error)) return;
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", textAlign: "center" }}>
        <p style={{ fontSize: "1.15rem", fontWeight: 600 }}>The panel failed to load</p>
        <p style={{ opacity: 0.7, marginTop: "0.5rem" }}>
          Refresh the page after an update, or try again.
        </p>
        <button type="button" style={{ marginTop: "1rem", padding: "0.5rem 1rem" }} onClick={() => reset()}>
          Try again
        </button>
      </body>
    </html>
  );
}
