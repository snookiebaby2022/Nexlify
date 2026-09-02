import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import {
  authenticatePanelApi,
  assertPanelApiActionAllowed,
  type PanelApiCaller,
} from "@/lib/panel-api-caller";
import { handleXuiAction } from "@/lib/xui-api";
import { mergeXtreamRequestParams } from "@/lib/xtream-request-params";
import { iptvJson } from "@/lib/iptv-json";

function xuiError(message: string, status: number, req: NextRequest) {
  return iptvJson({ status: "error", message }, { status, compressFor: req });
}

async function handleV1(req: NextRequest, params: URLSearchParams) {
  try {
    const caller = await authenticatePanelApi(req, params);
    if (!caller) {
      return xuiError("Unauthorized", 401, req);
    }

    const action = params.get("action");
    if (!action) {
      return xuiError("action required", 400, req);
    }

    const allowed = assertPanelApiActionAllowed(action, caller);
    if (!allowed.ok) {
      return xuiError(allowed.message, 403, req);
    }

    const result = await handleXuiAction(action, params, caller);
    return iptvJson(result, { compressFor: req });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return xuiError("Already exists", 409, req);
      if (e.code === "P2025") return xuiError("not found", 404, req);
      if (e.code === "P2003") return xuiError("Related record not found", 400, req);
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Insufficient credits" || msg === "Forbidden") {
      return xuiError(msg, msg === "Forbidden" ? 403 : 400, req);
    }
    console.error("[api/v1]", e instanceof Error ? e.message : e);
    return xuiError("Request failed", 500, req);
  }
}

export async function GET(req: NextRequest) {
  return handleV1(req, req.nextUrl.searchParams);
}

export async function POST(req: NextRequest) {
  const params = await mergeXtreamRequestParams(req);
  return handleV1(req, params);
}
