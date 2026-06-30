import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, createSessionToken, setSessionCookie, repairAdminPasswordIfCorrupted } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const passwordHash = await repairAdminPasswordIfCorrupted(user);
    const ok = await verifyPassword(password, passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = await createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    await setSessionCookie(token);

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (e) {
    console.error("[auth/login]", e);
    const msg = e instanceof Error ? e.message : "Login failed";
    const status = msg.includes("JWT_SECRET") ? 503 : 500;
    return NextResponse.json({ error: msg.includes("JWT_SECRET") ? "Server misconfigured (auth)" : "Login failed" }, { status });
  }
}
