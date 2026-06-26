import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePanelApiKey } from "@/lib/auth";
import { registerPanelActivation } from "@/lib/panel-sync";

const registerSchema = z.object({
  licenseKey: z.string().min(20),
  instanceId: z.string().min(8),
  panelUrl: z.string().url(),
  domain: z.string().min(1),
});

/** Customer panel registers after activation so admin can push license changes. */
export async function POST(request: Request) {
  if (!requirePanelApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = registerSchema.parse(await request.json());
    const result = await registerPanelActivation(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[licenses/register]", e);
    return NextResponse.json({ error: "Register failed" }, { status: 500 });
  }
}
