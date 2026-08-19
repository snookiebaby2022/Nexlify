import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  createSecurityAlert,
  getSecurityAlerts,
  resolveAlert,
  addToWhitelist,
  getWhitelist,
  removeFromWhitelist,
} from "@/lib/security-features";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [alerts, whitelist] = await Promise.all([
    getSecurityAlerts(),
    getWhitelist(),
  ]);

  return NextResponse.json({ alerts, whitelist });
}

export async function POST(req: Request) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const { action, type, severity, sourceIp, description, alertId, ip } = parsed.data;

  if (action === "create_alert") {
    const alert = await createSecurityAlert(type, severity, sourceIp, description);
    return NextResponse.json(alert);
  }

  if (action === "resolve") {
    await resolveAlert(alertId);
    return NextResponse.json({ ok: true });
  }

  if (action === "whitelist_add") {
    await addToWhitelist(ip, description);
    return NextResponse.json({ ok: true });
  }

  if (action === "whitelist_remove") {
    await removeFromWhitelist(ip);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
