import { NextRequest, NextResponse } from "next/server";
import { getLicenseStatus } from "@/lib/license";

export async function GET(req: NextRequest) {
  const host = (req.headers.get("host") ?? "localhost").split(":")[0].toLowerCase();
  const status = await getLicenseStatus(host);
  return NextResponse.json({ status });
}
