import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { issueTrialLicense, trialLicensePayload } from "@/lib/trial";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`trial-start:${ip}`, 5, 60 * 60 * 1000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const license = await issueTrialLicense(user.id);
    return NextResponse.json({
      success: true,
      ...trialLicensePayload(license),
      redirect: "/dashboard?trial_coupon=1",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Trial could not be started";
    const status = message.includes("already") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
