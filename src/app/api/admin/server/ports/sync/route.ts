import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { getPanelServerSettings } from "@/lib/panel-server";
import { CUSTOMER_FIREWALL_PORTS } from "@/lib/server-ports";
import {
  syncPanelPortsAfterSettingsSave,
} from "@/lib/panel-port-sync";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await getPanelServerSettings();
  const behindNginx =
    process.env.PANEL_BEHIND_NGINX === "1" || process.env.PANEL_BEHIND_NGINX === "true";

  const ports = {
    ...CUSTOMER_FIREWALL_PORTS,
    streamHttp: settings.streamHttpPort,
    https: settings.streamHttpsPort,
    panelUpstream: settings.panelPort,
  };

  return NextResponse.json({
    ports,
    behindNginx,
    streamEdgeSeparate: behindNginx && settings.streamHttpPort !== 80,
    syncCommand: "sudo bash scripts/sync-panel-ports.sh",
    autoSyncOnSave: true,
  });
}

export async function POST() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await syncPanelPortsAfterSettingsSave();
  const settings = await getPanelServerSettings();

  return NextResponse.json({
    ok: result.ok,
    message: result.message,
    output: result.output,
    ports: {
      streamHttp: settings.streamHttpPort,
      streamHttps: settings.streamHttpsPort,
    },
  });
}
