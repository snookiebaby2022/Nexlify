import { NextRequest, NextResponse } from "next/server";
import { authenticateAdminApi, handleXuiAction } from "@/lib/xui-api";

export async function GET(req: NextRequest) {
  const admin = await authenticateAdminApi(req);
  if (!admin) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  }

  const action = req.nextUrl.searchParams.get("action");
  if (!action) {
    return NextResponse.json({ status: "error", message: "action required" }, { status: 400 });
  }

  const result = await handleXuiAction(action, req.nextUrl.searchParams, admin.id);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
