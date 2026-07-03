import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const licenseKey = String(body.licenseKey ?? "").trim();
  if (!licenseKey) return NextResponse.json({ error: "licenseKey required" }, { status: 400 });

  const { sendActivationCodeToVendor } = await import("@/lib/license/remote-sync");
  const result = await sendActivationCodeToVendor(licenseKey);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to send code" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, email: result.email });
}
