import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  clearActiveConnections,
  deleteActiveConnection,
  PLAYBACK_STALE_MS,
} from "@/lib/connections";
import { listAdminConnections } from "@/lib/admin-connections-list";
import { PanelRole } from "@prisma/client";
import { ownerScope } from "@/lib/owner-scope";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

const ROLES = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER] as const;

export async function GET() {
  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const connections = await listAdminConnections(session);
  return NextResponse.json({ connections });
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([...ROLES]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  const scope = ownerScope(session);

  if (id === "all") {
    await clearActiveConnections(scope);
    return NextResponse.json({ ok: true });
  }
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await deleteActiveConnection(id, scope);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
