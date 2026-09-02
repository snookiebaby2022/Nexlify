import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticatePanelApi, assertPanelApiActionAllowed, assertLineInScope } from "@/lib/panel-api-caller";
import { handleXuiAction } from "@/lib/xui-api";
import { mergeXtreamRequestParams } from "@/lib/xtream-request-params";

export async function compatLineRequest(
  req: NextRequest,
  action: string,
  id?: string,
) {
  const params = await mergeXtreamRequestParams(req);
  if (id) params.set("id", id);
  const caller = await authenticatePanelApi(req, params);
  if (!caller) return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  if (action === "get_line_status") {
    const id = params.get("id");
    const username = params.get("username")?.trim();
    const scope = id ? await assertLineInScope(id, caller) : null;
    const line = id
      ? scope?.ok
        ? await prisma.line.findUnique({
            where: { id },
            select: { id: true, username: true, status: true, expiresAt: true },
          })
        : null
      : username
        ? await prisma.line.findFirst({
            where: { username, ...(caller.isAdmin ? {} : { ownerId: caller.id }) },
            select: { id: true, username: true, status: true, expiresAt: true },
          })
        : null;
    return NextResponse.json(line
      ? { status: "success", data: { id: line.id, username: line.username, status: line.status, expiresAt: line.expiresAt } }
      : { status: "error", message: "not found" }, { status: line ? 200 : 404 });
  }
  const allowed = assertPanelApiActionAllowed(action, caller);
  if (!allowed.ok) return NextResponse.json({ status: "error", message: allowed.message }, { status: 403 });
  const result = await handleXuiAction(action, params, caller);
  return NextResponse.json({ status: result.status, data: result });
}
