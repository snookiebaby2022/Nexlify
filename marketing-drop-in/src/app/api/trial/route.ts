import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { issueTrialLicense, trialLicensePayload } from "@/lib/trial";

function trialErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : "Trial could not be started";
  if (raw === "license_signing_key_missing" || raw.includes("license signing key")) {
    return "Trial is temporarily unavailable. Please try again later or contact support.";
  }
  return raw;
}

/** Issue a 7-day trial license immediately — no checkout or payment required. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const license = await issueTrialLicense(user.id);
    return NextResponse.json({
      success: true,
      redirect: "/dashboard",
      license: trialLicensePayload(license),
    });
  } catch (e) {
    return NextResponse.json({ error: trialErrorMessage(e) }, { status: 400 });
  }
}
