import { NextResponse } from "next/server";

/** WHMCS billing was removed. Stripe checkout is at /pricing. */
export async function GET() {
  return NextResponse.json(
    { error: "WHMCS billing was removed. Use Stripe checkout at /pricing." },
    { status: 410 }
  );
}

export async function POST() {
  return GET();
}
