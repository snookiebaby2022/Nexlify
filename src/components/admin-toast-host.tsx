"use client";

import { useEffect, useState } from "react";
import {
  adminToast,
  dismissAdminToast,
  subscribeAdminToasts,
  type AdminToastPayload,
} from "@/lib/admin-toast";

function toneStyle(tone: AdminToastPayload["tone"]) {
  if (tone === "error") {
    return {
      borderColor: "var(--danger)",
      background: "rgba(239,68,68,0.12)",
      color: "var(--danger)",
    };
  }
  if (tone === "success") {
    return {
      borderColor: "var(--success)",
      background: "rgba(34,197,94,0.12)",
      color: "var(--success)",
    };
  }
  return {
    borderColor: "var(--border)",
    background: "var(--bg-card)",
    color: "var(--text)",
  };
}

export function AdminToastHost() {
  const [items, setItems] = useState<AdminToastPayload[]>([]);

  useEffect(() => subscribeAdminToasts(setItems), []);

  if (!items.length) return null;

  return (
    <div
      className="fixed z-[120] bottom-20 md:bottom-6 right-3 left-3 md:left-auto md:w-[22rem] space-y-2 pointer-events-none"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-lg border px-3 py-2.5 text-sm shadow-lg flex gap-3 items-start"
          style={toneStyle(t.tone)}
          role="status"
        >
          <span className="flex-1 min-w-0 break-words">{t.message}</span>
          <button
            type="button"
            className="shrink-0 opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="Dismiss"
            onClick={() => dismissAdminToast(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** Re-export for call sites that prefer importing from the host module. */
export { adminToast };
