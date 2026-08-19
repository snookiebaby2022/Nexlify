import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  createFailoverTest,
  getFailoverTests,
  updateFailoverTest,
  deleteFailoverTest,
} from "@/lib/failover-testing";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tests = await getFailoverTests();
  return NextResponse.json({ tests });
}

export async function POST(req: Request) {
  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const { action, name, streamId, testId, status, result } = parsed.data;

  if (action === "create") {
    const test = await createFailoverTest(name, streamId);
    return NextResponse.json(test);
  }

  if (action === "update") {
    await updateFailoverTest(testId, status, result);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    await deleteFailoverTest(testId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
