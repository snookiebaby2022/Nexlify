/** Admin URL to resolve an activity or cron issue from the dashboard. */
export function activityFixHref(log: {
  action: string;
  entity?: string | null;
  entityId?: string | null;
  meta?: unknown;
}): string | null {
  const m = (log.meta && typeof log.meta === "object" ? log.meta : {}) as Record<string, unknown>;

  switch (log.action) {
    case "ssl_cert_failed":
    case "domains_update":
      return "/admin/settings/domains";
    case "panel_update_failed":
    case "panel_update_ok":
      return "/admin/settings/server";
    case "create_line":
    case "edit_line":
    case "delete_line":
    case "line_active":
    case "line_disabled":
    case "line_banned":
    case "api_create_line":
    case "api_edit_line":
      return log.entityId ? `/admin/lines?edit=${log.entityId}` : "/admin/lines";
    case "mass_enable":
    case "mass_disable":
    case "mass_delete":
    case "mass_extend":
    case "mass_set_bouquets":
      return "/admin/lines/mass-edit";
    case "edit_bouquet":
    case "create_bouquet":
      return log.entityId ? `/admin/bouquets` : "/admin/bouquets";
    case "mass_streams":
      return "/admin/management/mass-edit/streams";
    case "credit_add":
    case "credit_refund":
    case "credit_deduct":
      return "/admin/resellers";
    default:
      break;
  }

  if (log.entity === "stream" && log.entityId) {
    return `/admin/servers/streams?edit=${log.entityId}`;
  }
  if (log.entity === "line" && log.entityId) {
    return `/admin/lines?edit=${log.entityId}`;
  }
  if (m.sourceId && log.action.includes("epg")) {
    return "/admin/epg/sources";
  }

  return null;
}

export function cronFixHref(job: string, status: string): string | null {
  if (status === "ok") return null;
  const j = job.toLowerCase();
  if (j.includes("epg")) return "/admin/epg/sources";
  if (j.includes("backup")) return "/admin/settings/backup";
  if (j.includes("ssl") || j.includes("cert")) return "/admin/settings/domains";
  if (j.includes("stream") || j.includes("probe")) return "/admin/stream_errors";
  if (j.includes("license")) return "/admin/license";
  return "/admin/settings/server";
}
