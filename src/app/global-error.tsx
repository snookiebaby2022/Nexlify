"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full space-y-4 text-center">
            <h2 className="text-xl font-semibold text-red-400">Critical error</h2>
            <p className="text-sm text-slate-400">
              {error.message || "A critical error occurred. Please refresh the page."}
            </p>
            {error.digest && (
              <p className="text-xs text-slate-500 font-mono">Error ID: {error.digest}</p>
            )}
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-500 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
