import { NextResponse } from "next/server";
import { z } from "zod";
import { validateLicenseKey } from "@/lib/licensing";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const bodySchema = z.object({
  key: z.string().min(8).optional(),
  licenseKey: z.string().min(8).optional(),
});

/** Panel validate a license key against the marketing database. */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const limited = rateLimit(`license-validate:${ip}`, 30, 15 * 60 * 1000);
    if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

    const body = bodySchema.parse(await request.json());
    const key = body.key ?? body.licenseKey ?? "";
    const result = await validateLicenseKey(key);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    }
    const { license } = result;
    return NextResponse.json({
      ok: true,
      status: license.status,
      maxLines: license.maxLines,
      expiresAt: license.expiresAt?.toISOString() ?? null,
      plan: license.plan.name,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Validation failed" }, { status: 500 });
  }
}
