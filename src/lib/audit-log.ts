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
  mass_streams: "Mass edit streams",
  credit_add: "Credits added",
  credit_refund: "Credits refunded",
  credit_deduct: "Credits deducted",
  domains_update: "Panel domains updated",
  ssl_cert_issued: "SSL certificate issued",
  ssl_cert_failed: "SSL certificate request failed",
  panel_update_ok: "Panel software updated",
  panel_update_failed: "Panel software update failed",
};

export function formatAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/_/g, " ");
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
  return parts.length ? parts.join(" · ") : JSON.stringify(meta);
}
