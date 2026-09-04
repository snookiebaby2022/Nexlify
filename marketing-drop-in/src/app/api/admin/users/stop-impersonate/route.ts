import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  IMPERSONATOR_COOKIE,
  getImpersonatorUser,
  clearImpersonatorCookie,
} from "@/lib/auth";

export async function POST() {
  const impersonator = await getImpersonatorUser();
  if (!impersonator) {
    return NextResponse.json({ error: "Not impersonating" }, { status: 400 });
  }

  const store = await cookies();
  const adminToken = store.get(IMPERSONATOR_COOKIE)?.value;
  if (!adminToken) {
    return NextResponse.json({ error: "Admin session missing" }, { status: 400 });
  }

  store.set(COOKIE_NAME, adminToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  await clearImpersonatorCookie();

  return NextResponse.json({ ok: true, redirect: "/admin?tab=users" });
}
