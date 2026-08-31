import { NextResponse } from "next/server";

/** Legacy billing hook — removed. Stripe checkout is at /pricing. */
export async function GET() {
  return NextResponse.json(
    { error: "Legacy billing hook removed. Use Stripe checkout at /pricing." },
    { status: 410 }
  );
}

export async function POST() {
  return GET();
}
