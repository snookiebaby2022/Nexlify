import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/portal-session";
import { generateLinePassword } from "@/lib/credential-generate";
import { resolveLineCredentialMinLength } from "@/lib/line-credential-policy";

import { apiMutationErrorResponse } from "@/lib/parse-json-body";
export async function POST(req: NextRequest) {
  try {
  const session = await getPortalSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const current = String(body.currentPassword ?? "");
  const next = String(body.newPassword ?? "").trim();

  const minLen = await resolveLineCredentialMinLength();
  if (next.length < minLen) {
    return NextResponse.json(
      { error: `Password must be at least ${minLen} characters` },
      { status: 400 }
    );
  }

  const line = await prisma.line.findUnique({ where: { id: session.lineId } });
  if (!line || line.password !== current) {
    return NextResponse.json({ error: "Current password incorrect" }, { status: 400 });
  }

  await prisma.line.update({
    where: { id: line.id },
    data: { password: next },
  });

  return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
  const session = await getPortalSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (body.action === "generate") {
    const password = generateLinePassword();
    await prisma.line.update({
      where: { id: session.lineId },
      data: { password },
    });
    return NextResponse.json({ password });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
