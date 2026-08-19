import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import { createTenant, getTenants, deleteTenant, getTenantByReseller } from "@/lib/multi-tenancy";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenants = await getTenants();
  return NextResponse.json({ tenants });
}

export async function POST(req: Request) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const { action, name, resellerId, branding, tenantId } = parsed.data;

  if (action === "create") {
    const tenant = await createTenant(name, resellerId, branding);
    return NextResponse.json(tenant);
  }

  if (action === "delete") {
    await deleteTenant(tenantId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
