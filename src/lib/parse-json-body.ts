import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

export type ParseJsonOk<T> = { ok: true; data: T };
export type ParseJsonErr = { ok: false; response: NextResponse };
export type ParseJsonResult<T> = ParseJsonOk<T> | ParseJsonErr;

/** Parse JSON without throwing — malformed bodies become HTTP 400. */
export async function parseJsonBody<T = any>(
  req: Request
): Promise<ParseJsonResult<T>> {
  try {
    const data = (await req.json()) as T;
    if (data === null || typeof data !== "object") {
      return {
        ok: false,
        response: NextResponse.json({ error: "JSON object required" }, { status: 400 }),
      };
    }
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }
}

export function prismaErrorResponse(e: unknown): NextResponse | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Already exists" }, { status: 409 });
    }
    if (e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (e.code === "P2003") {
      return NextResponse.json({ error: "Related record not found" }, { status: 400 });
    }
    console.error("[api] prisma", e.code, e.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
  }
  if (e instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  return null;
}

export function apiMutationErrorResponse(
  e: unknown,
  opts?: { exposeMessage?: boolean }
): NextResponse {
  const mapped = prismaErrorResponse(e);
  if (mapped) return mapped;
  const message = e instanceof Error ? e.message : "Request failed";
  console.error("[api] mutation", message);
  const expose =
    opts?.exposeMessage === true &&
    message.length > 0 &&
    message.length <= 280 &&
    !/prisma|sqlstate|password|secret|stack|econnreset/i.test(message);
  return NextResponse.json({ error: expose ? message : "Request failed" }, { status: 500 });
}

/** Wrap POST/PATCH/PUT/DELETE handlers so req.json + Prisma failures become JSON errors. */
export function withJsonMutation<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (e) {
      return apiMutationErrorResponse(e);
    }
  };
}
