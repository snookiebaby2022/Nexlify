import { NextRequest, NextResponse } from "next/server";
import { requireSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { ensureStandardUserGroups } from "@/lib/ensure-user-groups";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
function roleLabel(role: PanelRole) {
  if (role === PanelRole.ADMIN) return "admin";
  if (role === PanelRole.SUB_RESELLER) return "sub-reseller";
  return "reseller";
}

const OWNER_ROLES: PanelRole[] = [PanelRole.ADMIN, PanelRole.RESELLER, PanelRole.SUB_RESELLER];

async function assertValidOwner(userId: string, parentId: string | null): Promise<string | null> {
  if (!parentId) return null;
  if (parentId === userId) return "A user cannot be their own owner";
  const parent = await prisma.panelUser.findUnique({
    where: { id: parentId },
    select: { id: true, role: true, parentId: true },
  });
  if (!parent) return "Owner not found";
  if (!OWNER_ROLES.includes(parent.role)) return "Owner must be an admin, reseller, or sub-reseller";
  let current = parent.parentId;
  const seen = new Set<string>([userId, parentId]);
  while (current) {
    if (seen.has(current)) return "That owner would create a circular hierarchy";
    seen.add(current);
    const row = await prisma.panelUser.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = row?.parentId ?? null;
  }
  return null;
}

function serializeUser(
  u: {
    id: string;
    username: string;
    email: string | null;
    role: PanelRole;
    isActive: boolean;
    credits: number;
    notes: string | null;
    updatedAt: Date;
    createdAt: Date;
    parent: { username: string } | null;
    group: { id: string; name: string } | null;
    _count: { lines: number };
  },
  displayId: number
) {
  return {
    id: u.id,
    displayId,
    username: u.username,
    password: "",
    email: u.email ?? "",
    role: u.role,
    roleLabel: roleLabel(u.role),
    isActive: u.isActive,
    credits: u.credits,
    notes: u.notes ?? "",
    owner: u.parent?.username ?? null,
    groupId: u.group?.id ?? null,
    groupName: u.group?.name ?? roleLabel(u.role),
    lines: u._count.lines,
    createdAt: u.createdAt.toISOString(),
    lastLogin: u.updatedAt.toISOString(),
    ip: null as string | null,
  };
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const singleId = req.nextUrl.searchParams.get("id");
  if (singleId) {
    const r = await prisma.panelUser.findUnique({
      where: { id: singleId },
      omit: {
        passwordHash: true,
        passwordPlain: true,
        totpSecret: true,
        apiKey: true,
        accessCode: true,
      },
      include: {
        _count: { select: { lines: true, children: true } },
        group: { select: { id: true, name: true } },
        parent: { select: { id: true, username: true } },
      },
    });
    if (!r) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({
      user: {
        id: r.id,
        username: r.username,
        password: "",
        email: r.email ?? "",
        role: r.role,
        isActive: r.isActive,
        credits: r.credits,
        maxLines: r.maxLines,
        profitPercent: r.profitPercent ?? 0,
        notes: r.notes ?? "",
        resellerDns: r.resellerDns ?? "",
        defaultLanguage: r.defaultLanguage,
        groupId: r.groupId,
        groupName: r.group?.name ?? roleLabel(r.role),
        parentId: r.parentId,
        parentUsername: r.parent?.username ?? null,
        lines: r._count.lines,
        subUsers: r._count.children,
      },
    });
  }

  const rows = await prisma.panelUser.findMany({
    omit: {
      passwordHash: true,
      passwordPlain: true,
      totpSecret: true,
      apiKey: true,
      accessCode: true,
    },
    include: {
      _count: { select: { lines: true, children: true } },
      resellerBouquets: { include: { bouquet: true } },
      group: { select: { id: true, name: true } },
      parent: { select: { username: true } },
    },
    orderBy: [{ role: "asc" }, { username: "asc" }],
  });

  const users = rows.map((r, i) =>
    serializeUser(
      {
        id: r.id,
        username: r.username,
        email: r.email,
        role: r.role,
        isActive: r.isActive,
        credits: r.credits,
        notes: r.notes,
        updatedAt: r.updatedAt,
        createdAt: r.createdAt,
        parent: r.parent,
        group: r.group,
        _count: r._count,
      },
      i + 1
    )
  );
  const resellers = users.filter((u) => u.role === PanelRole.RESELLER);

  return NextResponse.json({ users, resellers });
}

export async function PATCH(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.panelUser.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const data: {
    isActive?: boolean;
    notes?: string | null;
    credits?: number;
    resellerDns?: string | null;
    email?: string | null;
    username?: string;
    passwordHash?: string;
    passwordPlain?: string | null;
    role?: PanelRole;
    groupId?: string | null;
    parentId?: string | null;
    maxLines?: number;
    defaultLanguage?: string;
    profitPercent?: number;
  } = {};

  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null;
  if (body.credits != null) data.credits = Number(body.credits);
  if (body.email !== undefined) data.email = body.email ? String(body.email).trim() : null;
  if (body.username !== undefined) {
    const username = String(body.username).trim();
    if (!username) return NextResponse.json({ error: "Username required" }, { status: 400 });
    const { validateLineCredential } = await import("@/lib/credential-generate");
    const userErr = validateLineCredential(username, "username");
    if (userErr) return NextResponse.json({ error: userErr }, { status: 400 });
    data.username = username;
  }
  if (typeof body.password === "string" && body.password.trim()) {
    const plain = body.password.trim();
    const { validateLineCredential } = await import("@/lib/credential-generate");
    const passErr = validateLineCredential(plain, "password");
    if (passErr) return NextResponse.json({ error: passErr }, { status: 400 });
    data.passwordHash = await hashPassword(plain);
    data.passwordPlain = null;
  }
  if (body.maxLines != null) data.maxLines = Math.max(0, Number(body.maxLines) || 0);
  if (body.profitPercent != null) {
    data.profitPercent = Math.max(0, Math.min(500, Number(body.profitPercent) || 0));
  }
  if (body.defaultLanguage !== undefined) data.defaultLanguage = String(body.defaultLanguage || "en");
  if (body.groupId !== undefined) data.groupId = body.groupId ? String(body.groupId) : null;
  if (body.parentId !== undefined) data.parentId = body.parentId ? String(body.parentId) : null;

  if (body.resellerDns !== undefined) {
    try {
      const { normalizeResellerDnsInput } = await import("@/lib/reseller-dns");
      data.resellerDns = normalizeResellerDnsInput(body.resellerDns);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid reseller DNS" },
        { status: 400 }
      );
    }
  }

  if (body.role !== undefined) {
    const roleRaw = String(body.role).toUpperCase();
    if (roleRaw === "ADMIN") {
      if (id === session.id) {
        return NextResponse.json({ error: "Cannot change your own role this way" }, { status: 400 });
      }
      data.role = PanelRole.ADMIN;
      data.parentId = null;
      const groups = await ensureStandardUserGroups(prisma);
      data.groupId = groups.get("Administrators") ?? data.groupId ?? null;
    } else if (roleRaw === "SUB_RESELLER") {
      data.role = PanelRole.SUB_RESELLER;
      const groups = await ensureStandardUserGroups(prisma);
      if (!data.groupId) data.groupId = groups.get("Sub-resellers") ?? null;
      const parentId = body.parentId ? String(body.parentId) : existing.parentId;
      if (!parentId) {
        return NextResponse.json({ error: "Sub-reseller requires a parent user" }, { status: 400 });
      }
      data.parentId = parentId;
    } else if (roleRaw === "RESELLER") {
      data.role = PanelRole.RESELLER;
      const groups = await ensureStandardUserGroups(prisma);
      if (!data.groupId) data.groupId = groups.get("Resellers") ?? null;
      if (body.parentId !== undefined) data.parentId = body.parentId ? String(body.parentId) : null;
    } else {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
  }

  const nextRole = data.role ?? existing.role;
  if (nextRole === PanelRole.ADMIN) data.parentId = null;

  const nextParentId = data.parentId !== undefined ? data.parentId : existing.parentId;
  const ownerErr = await assertValidOwner(id, nextParentId ?? null);
  if (ownerErr) return NextResponse.json({ error: ownerErr }, { status: 400 });

  try {
    const user = await prisma.panelUser.update({
      where: { id },
      data,
    });

    if (body.resellerDns !== undefined) {
      try {
        const { syncResellerDnsIntoExtraDomains } = await import("@/lib/reseller-dns");
        await syncResellerDnsIntoExtraDomains();
      } catch {
        /* non-fatal */
      }
    }

    return NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role, groupId: user.groupId },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    if (msg.includes("Unique constraint") || msg.includes("username")) {
      return NextResponse.json({ error: "Username already taken" }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (id === session.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const lines = await prisma.line.count({ where: { ownerId: id } });
  const children = await prisma.panelUser.count({ where: { parentId: id } });
  if (children > 0) {
    return NextResponse.json({ error: "User has sub-resellers — remove or reassign them first" }, { status: 400 });
  }
  if (lines > 0) {
    return NextResponse.json({ error: "User has lines — reassign or delete lines first" }, { status: 400 });
  }

  await prisma.panelUser.delete({ where: { id } });
  return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJsonBody(req);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const role =
    body.role === "ADMIN"
      ? PanelRole.ADMIN
      : body.role === "SUB_RESELLER"
        ? PanelRole.SUB_RESELLER
        : PanelRole.RESELLER;

  const { resolveNewPanelUserCredentials } = await import("@/lib/reseller-credentials");
  const creds = await resolveNewPanelUserCredentials({
    role,
    username: String(body.username ?? ""),
    password: typeof body.password === "string" ? body.password : "",
  });
  if (!creds.ok) {
    return NextResponse.json({ error: creds.error }, { status: 400 });
  }
  const { username, password } = creds;

  const groups = await ensureStandardUserGroups(prisma);
  const defaultGroup =
    role === PanelRole.ADMIN
      ? groups.get("Administrators")
      : role === PanelRole.SUB_RESELLER
        ? groups.get("Sub-resellers")
        : groups.get("Resellers");

  const parentId =
    body.parentId && String(body.parentId).trim()
      ? String(body.parentId)
      : role === PanelRole.SUB_RESELLER
        ? null
        : role === PanelRole.ADMIN
          ? null
          : session.id;

  if (role === PanelRole.SUB_RESELLER && !parentId) {
    return NextResponse.json({ error: "Sub-reseller requires a parent user" }, { status: 400 });
  }

  let resellerDns: string | null = null;
  try {
    const { normalizeResellerDnsInput } = await import("@/lib/reseller-dns");
    resellerDns = normalizeResellerDnsInput(body.resellerDns);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid reseller DNS" },
      { status: 400 }
    );
  }

  const explicitBouquetIds = Array.isArray(body.bouquetIds)
    ? body.bouquetIds.map(String)
    : [];
  const { resolveBouquetsForNewReseller } = await import("@/lib/reseller-bouquets");
  const bouquetIds = await resolveBouquetsForNewReseller({
    role,
    parentId,
    explicitIds: explicitBouquetIds,
  });

  const reseller = await prisma.panelUser.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      role,
      email: body.email ? String(body.email) : null,
      isActive: body.isActive !== false,
      defaultLanguage: body.defaultLanguage ? String(body.defaultLanguage) : "en",
      groupId: body.groupId ? String(body.groupId) : defaultGroup ?? null,
      credits: Number(body.credits ?? 0),
      maxLines: Number(body.maxLines ?? 500),
      profitPercent: Math.max(0, Math.min(500, Number(body.profitPercent ?? 0) || 0)),
      parentId,
      resellerDns,
      notes: body.notes ? String(body.notes) : null,
      resellerBouquets: {
        create: bouquetIds.map((bouquetId: string) => ({ bouquetId })),
      },
    },
  });

  try {
    const { syncResellerDnsIntoExtraDomains } = await import("@/lib/reseller-dns");
    await syncResellerDnsIntoExtraDomains();
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    reseller: { id: reseller.id, username: reseller.username },
    password,
    bouquetCount: bouquetIds.length,
  });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
