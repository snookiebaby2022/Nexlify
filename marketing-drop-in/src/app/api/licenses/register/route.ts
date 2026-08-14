import { NextResponse } from "next/server";
import { z } from "zod";
import { registerPanelActivation } from "@/lib/panel-sync";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const registerSchema = z.object({
  licenseKey: z.string().min(20),
  instanceId: z.string().min(8),
  panelUrl: z.string().url(),
  domain: z.string().min(1),
});

/** Customer panel registers after activation so admin can push license changes. Auth is the license key. */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const limited = rateLimit(`license-register:${ip}`, 20, 60 * 60 * 1000);
    if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

    const body = registerSchema.parse(await request.json());
    const panelApiSecret =
      request.headers.get("x-panel-api-key") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      "";
    const result = await registerPanelActivation({ ...body, panelApiSecret });
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
