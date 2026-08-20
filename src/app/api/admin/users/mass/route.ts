import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PanelRole } from "@prisma/client";
import { logActivity } from "@/lib/lines";

import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data as Record<string, unknown>;
    const ids: string[] = (body.ids as string[]) ?? [];
    const action = body.action as string;
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

    let count = 0;

    if (action === "enable" || action === "disable") {
      const r = await prisma.panelUser.updateMany({
        where: { id: { in: ids }, role: { not: PanelRole.ADMIN } },
        data: { isActive: action === "enable" },
      });
      count = r.count;
    } else if (action === "addCredits" || action === "deductCredits") {
      const raw = action === "deductCredits" ? -Math.abs(Number(body.credits ?? 0)) : Number(body.credits ?? 0);
      if (raw !== 0) {
        const users = await prisma.panelUser.findMany({
          where: { id: { in: ids }, role: { not: PanelRole.ADMIN } },
          select: { id: true, credits: true },
        });
        if (users.length > 0) {
          await prisma.$transaction([
            ...users.map((u) =>
              prisma.panelUser.update({
                where: { id: u.id },
                data: { credits: Math.max(0, u.credits + raw) },
              })
            ),
            ...users.map((u) =>
              prisma.creditTransaction.create({
                data: {
                  userId: u.id,
                  amount: raw,
                  balanceAfter: Math.max(0, u.credits + raw),
                  note: action === "deductCredits" ? "Mass edit deduct" : "Mass edit",
                },
              })
            ),
          ]);
          count = users.length;
        }
      }
    } else if (action === "setCredits") {
      const amount = Math.max(0, Number(body.credits ?? 0));
      const users = await prisma.panelUser.findMany({
        where: { id: { in: ids }, role: { not: PanelRole.ADMIN } },
        select: { id: true, credits: true },
      });
      if (users.length > 0) {
        await prisma.$transaction([
          ...users.map((u) =>
            prisma.panelUser.update({
              where: { id: u.id },
              data: { credits: amount },
            })
          ),
          ...users.map((u) =>
            prisma.creditTransaction.create({
              data: {
                userId: u.id,
                amount: amount - u.credits,
                balanceAfter: amount,
                note: "Mass edit set credits",
              },
            })
          ),
        ]);
        count = users.length;
      }
    } else if (action === "setMaxLines") {
      const maxLines = Math.max(0, Math.round(Number(body.maxLines ?? 0)));
      const r = await prisma.panelUser.updateMany({
        where: { id: { in: ids }, role: { not: PanelRole.ADMIN } },
        data: { maxLines },
      });
      count = r.count;
    } else if (action === "setGroup") {
      const raw = body.groupId;
      const groupId = raw === null || raw === undefined || raw === "" ? null : String(raw);

      if (groupId) {
        const group = await prisma.userGroup.findUnique({
          where: { id: groupId },
          select: { id: true },
        });
        if (!group) {
          return NextResponse.json({ error: "Group not found" }, { status: 400 });
        }
      }

      const r = await prisma.panelUser.updateMany({
        where: { id: { in: ids }, role: { not: PanelRole.ADMIN } },
        data: { groupId },
      });
      count = r.count;
    } else if (action === "delete") {
      const r = await prisma.panelUser.deleteMany({
        where: { id: { in: ids }, role: { not: PanelRole.ADMIN } },
      });
      count = r.count;
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    await logActivity(`mass_users_${action}`, {
      userId: session.id,
      meta: { count, ids: ids.slice(0, 50), action, groupId: body.groupId ?? null },
    });

    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
