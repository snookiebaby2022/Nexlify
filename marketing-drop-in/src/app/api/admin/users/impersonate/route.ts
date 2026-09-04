import { NextResponse } from "next/server";
import {
  createSessionToken,
  getSessionUser,
  readSessionCookie,
  setImpersonatorCookie,
  setSessionCookie,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const admin = await getSessionUser();
  if (!admin || admin.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { id?: string };
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (id === admin.id) {
    return NextResponse.json({ error: "You are already that user" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role === "ADMIN") {
    return NextResponse.json({ error: "Cannot impersonate another admin" }, { status: 400 });
  }

  const adminToken = await readSessionCookie();
  if (!adminToken) return NextResponse.json({ error: "No admin session" }, { status: 401 });

  await setImpersonatorCookie(adminToken);
  const userToken = await createSessionToken(target, 60 * 60 * 2);
  await setSessionCookie(userToken, 60 * 60 * 2);

  await logAudit({
    userId: admin.id,
    email: admin.email,
    action: "user_impersonate",
    detail: target.email,
  });

  return NextResponse.json({ ok: true, redirect: "/dashboard" });
}
