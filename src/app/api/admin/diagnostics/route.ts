import { NextRequest, NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { getPanelDiagnosticsSnapshot, runDiagnosticsRecoverLbs } from "@/lib/panel-diagnostics";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const snapshot = await getPanelDiagnosticsSnapshot();
    return NextResponse.json(snapshot);
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const action = String(parsed.data.action ?? "").trim();

  try {
    if (action === "recover-lbs") {
      const result = await runDiagnosticsRecoverLbs();
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
