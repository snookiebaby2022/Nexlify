import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getTrialPromoCode, issueTrialLicense } from "@/lib/trial";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  code: z.string().min(4).max(64),
});

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`trial-redeem:${ip}`, 10, 15 * 60 * 1000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const { code } = schema.parse(await request.json());
    const expected = getTrialPromoCode();
    if (code.trim().toUpperCase() !== expected) {
      return NextResponse.json({ error: "Invalid trial code" }, { status: 400 });
    }

    const license = await issueTrialLicense(user.id);
    return NextResponse.json({
      success: true,
      key: license.key,
      expiresAt: license.expiresAt?.toISOString() ?? null,
      redirect: "/dashboard",
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Redeem failed";
    const status = message.includes("already") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
