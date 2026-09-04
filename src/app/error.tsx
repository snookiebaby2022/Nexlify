"use client";

import { useEffect } from "react";
import { reloadOnceForStaleChunks } from "@/lib/chunk-load-recovery";

export default function Error({
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
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-lg font-semibold">The panel failed to load</p>
      <p className="text-sm opacity-70 max-w-md">
        This often happens right after an update. Try again, or refresh the page.
      </p>
      <button
        type="button"
        className="px-4 py-2 rounded-md text-sm"
        style={{ background: "var(--accent, #5b6cff)", color: "#fff" }}
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
