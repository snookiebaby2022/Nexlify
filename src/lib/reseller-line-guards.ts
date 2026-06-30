import { PanelRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function assertResellerCanCreateLine(
  session: { id: string; role: PanelRole },
  bouquetIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (session.role === PanelRole.ADMIN) return { ok: true };

  const owner = await prisma.panelUser.findUnique({
    where: { id: session.id },
    select: {
      credits: true,
      maxLines: true,
      _count: { select: { lines: true } },
      resellerBouquets: { select: { bouquetId: true } },
    },
  });
  if (!owner) return { ok: false, error: "Forbidden" };

  if (owner.maxLines > 0 && owner._count.lines >= owner.maxLines) {
    return {
      ok: false,
      error: `Line limit reached (${owner.maxLines} max). Contact your upline for more capacity.`,
    };
  }

  const allowed = new Set(owner.resellerBouquets.map((b) => b.bouquetId));
  if (allowed.size > 0 && bouquetIds.length) {
    const invalid = bouquetIds.filter((id) => !allowed.has(id));
    if (invalid.length) {
      return {
        ok: false,
        error: "One or more bouquets are not allowed for your reseller account",
      };
    }
  }

  return { ok: true };
}
