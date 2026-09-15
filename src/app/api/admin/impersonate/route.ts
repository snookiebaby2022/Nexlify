import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PanelRole } from "@prisma/client";
import { createSession, createSessionToken, getSession, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { panelSessionCookieOptions } from "@/lib/session-cookie";

const IMPERSONATOR = "nexlify_impersonator";

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody<{ userId?: unknown }>(req);
  if (!parsed.ok) return parsed.response;
  const userId = String(parsed.data.userId ?? "").trim();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const target = await prisma.panelUser.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true, credits: true, permissions: true, isActive: true },
  });
  if (!target || !target.isActive) {
    return NextResponse.json({ error: "User not found or disabled" }, { status: 404 });
  }
  if (target.role === PanelRole.ADMIN) {
    return NextResponse.json({ error: "Cannot login as another admin" }, { status: 400 });
  }

  const adminToken = await createSessionToken(session, { maxAgeDays: 1 });
  const jar = await cookies();
  jar.set(IMPERSONATOR, adminToken, { ...panelSessionCookieOptions(req, 1), path: "/" });

  await createSession(
    {
      id: target.id,
      username: target.username,
      role: target.role,
      credits: target.credits,
      permissions: Array.isArray(target.permissions) ? (target.permissions as string[]) : [],
    },
    { req, maxAgeDays: 1 }
  );

  return NextResponse.json({
    ok: true,
    username: target.username,
    redirect: "/reseller/dashboard",
  });
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const jar = await cookies();
  const token = jar.get(IMPERSONATOR)?.value;
  if (!token) return NextResponse.json({ error: "Not impersonating" }, { status: 400 });

  const { jwtVerify } = await import("jose");
  const { jwtSecretBytes } = await import("@/lib/jwt-secret");
  const secret = jwtSecretBytes();
  if (!secret) return NextResponse.json({ error: "JWT is not configured" }, { status: 500 });
  try {
    const { payload } = await jwtVerify(token, secret);
    const admin = await prisma.panelUser.findUnique({
      where: { id: String(payload.id ?? "") },
      select: { id: true, username: true, role: true, credits: true, permissions: true, isActive: true },
    });
    if (!admin || admin.role !== PanelRole.ADMIN || !admin.isActive) {
      jar.delete(IMPERSONATOR);
      return NextResponse.json({ error: "Admin session expired" }, { status: 403 });
    }
    await createSession(
      {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        credits: admin.credits,
        permissions: Array.isArray(admin.permissions) ? (admin.permissions as string[]) : [],
      },
      { req, maxAgeDays: 7 }
    );
    jar.delete(IMPERSONATOR);
    return NextResponse.json({ ok: true, redirect: "/admin/dashboard" });
  } catch {
    jar.delete(IMPERSONATOR);
    return NextResponse.json({ error: "Could not restore admin session" }, { status: 403 });
  }
}

export async function GET() {
  const session = await getSession();
  const jar = await cookies();
  const impersonating = Boolean(jar.get(IMPERSONATOR)?.value);
  return NextResponse.json({
    impersonating,
    username: session?.username ?? null,
    role: session?.role ?? null,
  });
}
