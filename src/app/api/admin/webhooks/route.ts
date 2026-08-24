import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  listOutboundWebhooks,
  saveOutboundWebhooks,
  WEBHOOK_EVENTS,
  type OutboundWebhook,
} from "@/lib/outbound-webhooks";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const webhooks = await listOutboundWebhooks();
  return NextResponse.json({ webhooks, events: WEBHOOK_EVENTS });
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const url = String(body.url ?? "").trim();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const events = Array.isArray(body.events)
    ? body.events.map(String)
    : [String(body.event ?? "line.created")];

  const items = await listOutboundWebhooks();
  const hook: OutboundWebhook = {
    id: body.id ? String(body.id) : `wh_${Date.now()}`,
    url,
    events,
    secret: body.secret ? String(body.secret) : undefined,
    isActive: body.isActive !== false,
    label: body.label ? String(body.label) : undefined,
  };

  const idx = items.findIndex((w) => w.id === hook.id);
  if (idx >= 0) items[idx] = hook;
  else items.unshift(hook);

  await saveOutboundWebhooks(items);
  return NextResponse.json({ webhook: hook });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const items = (await listOutboundWebhooks()).filter((w) => w.id !== id);
  await saveOutboundWebhooks(items);
  return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
