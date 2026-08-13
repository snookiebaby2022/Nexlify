import { NextRequest, NextResponse } from "next/server";
import { getLicenseStatus } from "@/lib/license";

export async function GET(req: NextRequest) {
  try {
    const host = (req.headers.get("host") ?? "localhost").split(":")[0].toLowerCase();
    const status = await getLicenseStatus(host);
    return NextResponse.json({ status });
  } catch (err) {
    console.error("[license/status]", err);
    return NextResponse.json(
      {
        status: { valid: false, reason: "License status unavailable" },
        error: "License status check failed",
      },
      { status: 200 }
    );
  }
}
