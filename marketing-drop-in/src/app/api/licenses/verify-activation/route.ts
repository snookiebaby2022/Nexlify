import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyActivationCode } from "@/lib/activation-code";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  licenseKey: z.string().min(20),
  code: z.string().length(6),
});

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`verify-activation:${ip}`, 10, 15 * 60 * 1000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  try {
    const body = schema.parse(await request.json());
    const result = await verifyActivationCode(body.licenseKey, body.code);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      email: result.email,
      plan: result.plan,
      expiresAt: result.expiresAt,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Verification failed" }, { status: 500 });
  }
}
