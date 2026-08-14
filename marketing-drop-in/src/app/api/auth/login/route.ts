import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  createSessionToken,
  setSessionCookie,
  repairAdminPasswordIfCorrupted,
  dummyPasswordCheck,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const ipLimit = rateLimit(`login-ip:${ip}`, 10, 15 * 60 * 1000);
    if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfterSec);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const emailLimit = rateLimit(`login-email:${email}`, 10, 15 * 60 * 1000);
    if (!emailLimit.ok) return rateLimitResponse(emailLimit.retryAfterSec);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await dummyPasswordCheck(password);
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

    await logAudit({ userId: user.id, email: user.email, action: "login", ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null });

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
