import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "WHMCS module download was removed." },
    { status: 410 }
  );
}
