"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const ACTIONS = [
  "get_bouquets",
  "get_bouquet_streams",
  "get_users",
  "get_lines",
  "get_line",
  "set_line_bouquets",
  "get_streams",
  "get_movies",
  "get_series",
  "get_mag",
  "get_categories",
  "create_category",
  "edit_category",
  "delete_category",
  "live_connections",
  "get_processes",
  "start_stream",
  "stop_stream",
  "restart_stream",
  "add_stream_to_bouquet",
  "remove_stream_from_bouquet",
  "set_epg_channel",
  "sync_epg",
  "reload_epg",
  "mass_enable_streams",
  "mass_disable_streams",
  "apply_server_config",
  "get_dashboard",
  "activity_logs",
  "get_access_codes",
  "get_analytics",
  "create_line",
  "edit_line",
  "disable_line",
  "enable_line",
  "ban_line",
  "unban_line",
  "delete_line",
  "create_reseller",
  "assign_bouquet_to_reseller",
  "kick_user",
  "get_transcodes",
];

export default function AdminApiDocsPage() {
  const [hmacSecret, setHmacSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const base = typeof window !== "undefined" ? `${window.location.origin}/api/v1` : "/api/v1";

  useEffect(() => {
    fetch("/api/admin/hmac-secret")
      .then((r) => r.json())
      .then((d) => setHmacSecret(d.secret ?? ""))
      .catch(() => null);
  }, []);

  async function saveHmac() {
    try {
      await fetch("/api/admin/hmac-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: hmacSecret }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Network error — notify via the saved state so the UI reflects failure
      setSaved(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Admin API</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          XUI-compatible JSON API at <code>/api/v1</code> and XUI.one&apos;s <code>/api.php</code>.
          Use your admin user&apos;s API key from Profile. ActiveCode lines: pass{" "}
          <code>auth_mode=active_code</code> and <code>active_code=</code> on create_line.
        </p>
      </div>

      <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-medium">Base URL</div>
        <code className="text-xs break-all block">{base}?api_key=YOUR_KEY&amp;action=ACTION</code>
        <code className="text-xs break-all block mt-1 opacity-80">
          {typeof window !== "undefined" ? `${window.location.origin}/api.php` : "/api.php"}
          ?api_key=YOUR_KEY&amp;action=ACTION
        </code>
      </div>

      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-medium">HMAC signing (optional)</div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Sign query string (excluding <code>hmac</code>) with SHA-256 HMAC; send as{" "}
          <code>X-Nexlify-Signature</code>. HMAC never replaces <code>api_key</code>.
        </p>
        <input
          type="password"
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)" }}
          placeholder="HMAC secret"
          value={hmacSecret}
          onChange={(e) => setHmacSecret(e.target.value)}
        />
        <button
          type="button"
          onClick={saveHmac}
          className="rounded-lg px-4 py-2 text-sm cursor-pointer"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {saved ? "Saved" : "Save HMAC secret"}
        </button>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Actions</h2>
        <ul className="grid sm:grid-cols-2 gap-1 text-sm font-mono">
          {ACTIONS.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Outbound webhooks: <Link href="/admin/webhooks" className="underline">/admin/webhooks</Link>
      </p>
    </div>
  );
}
