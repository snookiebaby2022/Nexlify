import { streamProbeFixHint } from "@/lib/stream-probe-fix-hints";

function metaRecord(meta: unknown): Record<string, unknown> {
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
}

/** Short remediation text for audit / stream log rows. */
export function auditLogFixHint(action: string, meta?: unknown, detail?: string | null): string | null {
  const m = metaRecord(meta);
  const err = String(detail ?? m.error ?? m.detail ?? "").trim();

  if (action.startsWith("playback_") || action === "stream_hls_relay_error" || action === "stream_primary_failover") {
    const low = err.toLowerCase();
    if (low.includes("502") || low.includes("bad gateway")) {
      return "Panel nginx must not proxy live bitrate — playback runs on the edge (server_info URL). If clients hit the panel host for /live/, fix DNS/LB or server_info.url; do not redirect /live/ on the panel.";
    }
    if (low.includes("403") || low.includes("401")) {
      return "Line may be expired, disabled, or over max connections. Check line status, expiry, bouquets, and active connections; kick stale sessions if needed.";
    }
    if (action === "playback_freeze" || action === "playback_stutter") {
      return "Usually upstream quality or client buffer — verify the stream source with Full probe, check provider bitrate, and review edge load.";
    }
    if (action === "stream_primary_failover" || action === "playback_failover") {
      return "Primary URL failed and backup was used. Fix or replace the primary source URL; keep a valid backup if the channel is critical.";
    }
    return streamProbeFixHint(err || "upstream playback failed");
  }

  if (action === "clear_live_dashboard_issues") {
    return "This only clears probe flags on the dashboard — it does not repair sources. Re-run Full probe on channels that still fail for viewers.";
  }

  if (action.includes("probe") || action === "edit_stream" || action === "mass_streams") {
    if (err) return streamProbeFixHint(err);
    if (action === "edit_stream") {
      return "After URL changes, run Full probe and confirm the channel is Active if it was disabled.";
    }
  }

  if (action.startsWith("panel_login_failed")) {
    return "Check username/password, VPN/geo blocks (Security), and brute-force lockout. Failed attempts are logged with IP in Details.";
  }

  if (action.startsWith("iptv_line_login")) {
    return "IPTV app authenticated against player_api. If clients fail, verify line expiry, isActive, bouquets, and that they use the panel URL from server_info (not an old host).";
  }

  return null;
}
