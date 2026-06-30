import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getActiveTrialLicense } from "@/lib/trial";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ active: false, expiresAt: null });
  }

  const trial = await getActiveTrialLicense(user.id);
  if (!trial?.expiresAt || trial.expiresAt < new Date()) {
    return NextResponse.json({ active: false, expiresAt: null });
  }

  return NextResponse.json({
    active: true,
    expiresAt: trial.expiresAt.toISOString(),
  });
}
