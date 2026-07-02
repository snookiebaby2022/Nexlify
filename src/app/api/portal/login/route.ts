import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPortalSession, clearPortalSession } from "@/lib/portal-session";
import { lineIsPlayable } from "@/lib/lines";
import { checkLoginRateLimit, recordLoginFailure, clearLoginFailures } from "@/lib/login-rate-limit";
import { getClientIp } from "@/lib/client-ip";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const ip = getClientIp(req);
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  if (body.action === "logout") {
    await clearPortalSession();
    return NextResponse.json({ ok: true });
  }

  if (!username || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const rl = await checkLoginRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json({ error: rl.error }, { status: 429 });
  }

  const line = await prisma.line.findUnique({
    where: { username },
    include: { bouquets: { include: { bouquet: true } } },
  });

  if (!line || line.password !== password) {
    await recordLoginFailure(ip);
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  await clearLoginFailures(ip);
  await createPortalSession({ id: line.id, username: line.username });

  return NextResponse.json({
    ok: true,
    redirect: "/portal/dashboard",
    line: {
      username: line.username,
      status: line.status,
      expiresAt: line.expiresAt,
      playable: lineIsPlayable(line),
      bouquets: line.bouquets.map((b) => b.bouquet.name),
    },
  });
}
