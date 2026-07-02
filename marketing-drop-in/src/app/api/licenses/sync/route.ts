import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePanelApiKey } from "@/lib/auth";
import { clearPendingSync, getPendingSyncForPanel } from "@/lib/panel-sync";

const syncQuerySchema = z.object({
  instanceId: z.string().min(8),
  keyHash: z.string().optional(),
});

/** Customer panel polls for pending admin license commands. */
export async function GET(request: Request) {
  if (!requirePanelApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = syncQuerySchema.safeParse({
    instanceId: searchParams.get("instanceId") ?? "",
    keyHash: searchParams.get("keyHash") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "instanceId required" }, { status: 400 });
  }

  const pending = await getPendingSyncForPanel(parsed.data.instanceId, parsed.data.keyHash);
  return NextResponse.json(pending);
}

const ackSchema = z.object({
  licenseId: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
});

/** Panel confirms sync command applied (clears pending queue). */
export async function PATCH(request: Request) {
  if (!requirePanelApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = ackSchema.parse(await request.json());
    await clearPendingSync(body.licenseId, body.ok ? undefined : body.error ?? "Panel sync failed");
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Ack failed" }, { status: 500 });
  }
}
