import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { PanelRole } from "@prisma/client";
import {
  incrementAccessCodeUse,
  resolveLineCreateFromPackage,
} from "@/lib/package-line";
import { getSettingGroup } from "@/lib/panel-settings";
import {
  generateLinePassword,
  generateLineUsername,
  MIN_LINE_CREDENTIAL_LENGTH,
  validateLineCredential,
} from "@/lib/credential-generate";
import { LineStatus } from "@prisma/client";

export async function GET() {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const where =
    session.role === PanelRole.ADMIN ? {} : { ownerId: session.id };

  const lines = await prisma.line.findMany({
    where,
    include: {
      bouquets: { include: { bouquet: true } },
      owner: { select: { id: true, username: true } },
      lastWatchedStream: { select: { id: true, name: true } },
      _count: { select: { channelWatches: true, liveConnections: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ lines });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const security = await getSettingGroup("security");
  const minLen = Math.max(
    MIN_LINE_CREDENTIAL_LENGTH,
    Number(security.lineCredentialMinLength ?? MIN_LINE_CREDENTIAL_LENGTH) || MIN_LINE_CREDENTIAL_LENGTH
  );
  const autoGen = security.autoGenerateLineCredentials !== false;

  let username = String(body.username ?? "").trim();
  let password = String(body.password ?? "").trim();
  if (!username && autoGen) username = generateLineUsername();
  if (!password && autoGen) password = generateLinePassword();
  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required (or enable auto-generate in Settings → Security)" },
      { status: 400 }
    );
  }

  const userErr = validateLineCredential(username, "username", minLen);
  if (userErr) return NextResponse.json({ error: userErr }, { status: 400 });
  const passErr = validateLineCredential(password, "password", minLen);
  if (passErr) return NextResponse.json({ error: passErr }, { status: 400 });

  let maxConnections = Number(body.maxConnections ?? 1);
  let days = Number(body.days ?? 30);
  let bouquetIds: string[] = body.bouquetIds ?? [];
  let totalCost = 1;

  try {
    const resolved = await resolveLineCreateFromPackage(body);
    days = resolved.days;
    maxConnections = resolved.maxConnections;
    bouquetIds = resolved.bouquetIds;
    totalCost = resolved.creditCost;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }

  const paysCredits =
    session.role === PanelRole.RESELLER || session.role === PanelRole.SUB_RESELLER;

  if (paysCredits && totalCost > 0) {
    const owner = await prisma.panelUser.findUnique({ where: { id: session.id } });
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (owner.credits < totalCost) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 400 });
    }

    await prisma.panelUser.update({
      where: { id: session.id },
      data: { credits: { decrement: totalCost } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId: session.id,
        amount: -totalCost,
        balanceAfter: owner.credits - totalCost,
        note: `Line ${username}`,
      },
    });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  const statusRaw = String(body.status ?? "ACTIVE").toUpperCase();
  const status =
    statusRaw === "DISABLED"
      ? LineStatus.DISABLED
      : statusRaw === "BANNED"
        ? LineStatus.BANNED
        : LineStatus.ACTIVE;

  const line = await prisma.line.create({
    data: {
      username,
      password,
      status,
      maxConnections,
      expiresAt,
      notes: body.notes ? String(body.notes) : null,
      externalId: body.externalId ? String(body.externalId) : undefined,
      ownerId:
        session.role === PanelRole.ADMIN
          ? body.ownerId
            ? String(body.ownerId)
            : undefined
          : session.id,
      lockToIp: Boolean(body.lockToIp),
      allowedIps: body.allowedIps ? String(body.allowedIps) : null,
      allowedCountries: body.allowedCountries ? String(body.allowedCountries) : null,
      blockedCountries: body.blockedCountries ? String(body.blockedCountries) : null,
      forcedServerId: body.forcedServerId ? String(body.forcedServerId) : null,
      bouquets: { create: bouquetIds.map((bouquetId: string) => ({ bouquetId })) },
    },
    include: { bouquets: { include: { bouquet: true } } },
  });

  if (body.accessCode) {
    await incrementAccessCodeUse(String(body.accessCode));
  }

  await logActivity("create_line", {
    userId: session.id,
    lineId: line.id,
    entity: "line",
    entityId: line.id,
  });

  return NextResponse.json({ line });
}
