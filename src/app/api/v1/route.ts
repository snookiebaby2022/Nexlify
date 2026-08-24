import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { authenticateAdminApi, handleXuiAction } from "@/lib/xui-api";
import { mergeXtreamRequestParams } from "@/lib/xtream-request-params";

function xuiError(message: string, status: number) {
  return NextResponse.json({ status: "error", message }, { status });
}

async function handleV1(req: NextRequest, params: URLSearchParams) {
  try {
    const admin = await authenticateAdminApi(req, params);
    if (!admin) {
      return xuiError("Unauthorized", 401);
    }

    const action = params.get("action");
    if (!action) {
      return xuiError("action required", 400);
    }

    const result = await handleXuiAction(action, params, admin.id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return xuiError("Already exists", 409);
      if (e.code === "P2025") return xuiError("not found", 404);
      if (e.code === "P2003") return xuiError("Related record not found", 400);
    }
    console.error("[api/v1]", e instanceof Error ? e.message : e);
    return xuiError("Request failed", 500);
  }
}

export async function GET(req: NextRequest) {
  return handleV1(req, req.nextUrl.searchParams);
}

export async function POST(req: NextRequest) {
  const params = await mergeXtreamRequestParams(req);
  return handleV1(req, params);
}
