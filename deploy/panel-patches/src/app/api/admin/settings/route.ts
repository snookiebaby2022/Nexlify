import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getAllSettings,
  getCommunityLinksSettings,
  getSettingGroup,
  setSettingGroup,
  SETTING_GROUPS,
  type SettingGroup,
} from "@/lib/panel-settings";
import { PanelRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const group = req.nextUrl.searchParams.get("group") as SettingGroup | null;
  if (group && SETTING_GROUPS.includes(group)) {
    if (group === "community") {
      return NextResponse.json({ group, settings: await getCommunityLinksSettings() });
    }
    return NextResponse.json({ group, settings: await getSettingGroup(group) });
  }
  return NextResponse.json({ settings: await getAllSettings() });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const group = body.group as SettingGroup;
  if (!group || !SETTING_GROUPS.includes(group)) {
    return NextResponse.json({ error: "Invalid group" }, { status: 400 });
  }
  const settings = await setSettingGroup(group, body.settings ?? {});
  if (group === "domains") {
    const { savePanelDomainsSettings, parsePanelDomainsSettings } = await import("@/lib/domains");
    await savePanelDomainsSettings(parsePanelDomainsSettings(settings));
  }
  if (group === "security") {
    const { syncPanelSecurityEnv } = await import("@/lib/panel-security-env");
    syncPanelSecurityEnv(settings);
  }
  if (group === "server") {
    const { syncPanelServerEnv, parsePanelServerSettings } = await import("@/lib/panel-server");
    syncPanelServerEnv(parsePanelServerSettings(settings));
  }
  if (group === "streams") {
    const { cacheDel } = await import("@/lib/cache");
    await cacheDel("settings:excludeDisabledExport");
    await cacheDel("xtream:live_categories");
    const { queueApplyConfigAllServers } = await import("@/lib/agent-config-push");
    const queued = await queueApplyConfigAllServers();
    return NextResponse.json({ group, settings, agentConfigQueued: queued });
  }
  return NextResponse.json({ group, settings });
}
