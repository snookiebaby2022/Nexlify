export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create_line: "Line created",
  edit_line: "Line updated",
  delete_line: "Line deleted",
  line_active: "Line enabled",
  line_disabled: "Line disabled",
  line_banned: "Line banned",
  mass_enable: "Mass enable lines",
  mass_disable: "Mass disable lines",
  mass_delete: "Mass delete lines",
  mass_extend: "Mass extend lines",
  mass_set_bouquets: "Mass set bouquets",
  api_create_line: "API: create line",
  api_edit_line: "API: edit line",
  api_delete_line: "API: delete line",
  billing_create: "Billing: line created",
  edit_bouquet: "Bouquet updated",
  create_bouquet: "Bouquet created",
  delete_bouquet: "Bouquet deleted",
  duplicate_bouquet: "Bouquet duplicated",
  mass_streams: "Mass edit streams",
  mass_users_enable: "Mass enable users",
  mass_users_disable: "Mass disable users",
  mass_users_addCredits: "Mass add credits",
  mass_users_setGroup: "Mass change user group",
  create_stream: "Stream created",
  edit_stream: "Stream updated",
  delete_stream: "Stream deleted",
  remove_duplicates: "Duplicates removed",
  credit_add: "Credits added",
  credit_refund: "Credits refunded",
  credit_deduct: "Credits deducted",
  domains_update: "Panel domains updated",
  ssl_cert_issued: "SSL certificate issued",
  ssl_cert_failed: "SSL certificate request failed",
  panel_update_ok: "Panel software updated",
  panel_update_failed: "Panel software update failed",
  vpn_auto_block: "VPN/hosting IP auto-blocked",
  playback_freeze: "Playback freeze",
  playback_stutter: "Playback stutter",
  playback_drop: "Playback failed (upstream)",
  playback_origin_fail: "Playback origin failed",
  playback_failover: "Playback failover",
  stream_primary_failover: "Live primary failover",
};

export function formatAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

/** One honest sentence for the dashboard — drop ≠ delete, disable ≠ deleted. */
export function formatAuditHeadline(
  action: string,
  meta?: unknown
): { label: string; detail: string | null } {
  const m = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  const massAction = String(m.action ?? "");

  if (
    action === "playback_drop" ||
    action === "playback_freeze" ||
    action === "playback_stutter" ||
    action === "playback_origin_fail"
  ) {
    return {
      label: formatAuditAction(action),
      detail: "Viewer playback issue — the channel was not deleted.",
    };
  }
  if (action === "delete_stream" || (action === "mass_streams" && massAction === "delete")) {
    return {
      label: action === "delete_stream" ? "Stream permanently deleted" : "Streams permanently deleted",
      detail: "Removed from the catalog. This is not a disable.",
    };
  }
  if (action === "mass_streams" && massAction === "disable") {
    return {
      label: "Streams disabled",
      detail: "Still in the catalog — players cannot see them until enabled.",
    };
  }
  if (action === "mass_streams" && massAction === "enable") {
    return {
      label: "Streams enabled",
      detail: "Visible to players again. They were not newly created.",
    };
  }
  if (action === "edit_stream" && m.isActive === false) {
    return {
      label: "Stream disabled",
      detail: "Still in the catalog — not deleted.",
    };
  }
  return { label: formatAuditAction(action), detail: formatAuditMeta(meta) };
}

export function formatAuditMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const parts: string[] = [];
  const m = meta as Record<string, unknown>;
  if (m.count != null) parts.push(`${m.count} items`);
  if (m.action) parts.push(String(m.action));
  if (m.ids && Array.isArray(m.ids)) parts.push(`${m.ids.length} IDs`);
  if (m.minSpeedKbps != null) parts.push(`min ${m.minSpeedKbps} Kbps`);
  if (m.maxSpeedKbps != null) parts.push(`max ${m.maxSpeedKbps} Kbps`);
  if (m.name) parts.push(String(m.name));
  if (m.detail) parts.push(String(m.detail));
  if (m.error) parts.push(String(m.error));
  if (m.status != null) parts.push(`HTTP ${m.status}`);
  if (m.sessions != null) parts.push(`${m.sessions} sessions`);
  return parts.length ? parts.join(" · ") : JSON.stringify(meta);
}
