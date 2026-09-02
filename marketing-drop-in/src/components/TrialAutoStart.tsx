"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** When ?trial=1, issue a trial license and land on the dashboard (no checkout). */
export function TrialAutoStart() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("trial") !== "1" || started.current) return;
    started.current = true;

    (async () => {
      try {
        const res = await fetch("/api/trial", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Trial could not be started");
        router.replace("/dashboard");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Trial could not be started");
      }
    })();
  }, [router, searchParams]);

  if (!error) return null;

  return (
    <div
      className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
      role="alert"
    >
      {error}
    </div>
  );
}
