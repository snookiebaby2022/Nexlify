import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { getAppUrl } from "@/lib/stripe";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.redirect(`${getAppUrl()}/`, { status: 303 });
}

export async function GET() {
  await clearSessionCookie();
  return NextResponse.redirect(`${getAppUrl()}/`, { status: 303 });
}
