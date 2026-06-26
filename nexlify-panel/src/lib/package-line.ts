import { prisma } from "@/lib/prisma";

export async function resolveLineCreateFromPackage(body: {
  packageId?: string;
  accessCode?: string;
  days?: number;
  maxConnections?: number;
  bouquetIds?: string[];
}) {
  let days = Number(body.days ?? 30);
  let maxConnections = Number(body.maxConnections ?? 1);
  let bouquetIds: string[] = body.bouquetIds ?? [];
  let creditCost = 1;

  if (body.accessCode) {
    const code = await prisma.accessCode.findFirst({
      where: { code: String(body.accessCode).trim(), isActive: true },
    });
    if (!code) throw new Error("Invalid access code");
    if (code.expiresAt && code.expiresAt < new Date()) throw new Error("Access code expired");
    if (code.uses >= code.maxUses) throw new Error("Access code fully used");
    days = code.days;
    maxConnections = code.maxConnections;
    bouquetIds = code.bouquetIds.length ? [...code.bouquetIds] : bouquetIds;
    if (code.packageId) body.packageId = code.packageId;
  }

  if (body.packageId) {
    const pkg = await prisma.package.findUnique({
      where: { id: String(body.packageId), isActive: true },
    });
    if (!pkg) throw new Error("Package not found");
    days = pkg.days;
    maxConnections = pkg.maxLines;
    if (pkg.bouquetIds.length) bouquetIds = [...pkg.bouquetIds];
    creditCost = Math.max(0, pkg.creditCost);
  }

  return { days, maxConnections, bouquetIds, creditCost, accessCodeId: body.accessCode };
}

export async function incrementAccessCodeUse(code: string) {
  await prisma.accessCode.updateMany({
    where: { code: code.trim(), isActive: true },
    data: { uses: { increment: 1 } },
  });
}
