import { NextResponse } from "next/server";
import { LICENSE_TERMS } from "@/lib/license/terms";

export async function GET() {
  const terms = Object.entries(LICENSE_TERMS).map(([id, t]) => ({
    id,
    label: t.label,
    days: t.days,
  }));
  return NextResponse.json({ terms });
}
