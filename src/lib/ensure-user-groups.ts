import type { PrismaClient } from "@prisma/client";
import { ensureStandardGroupPackages } from "@/lib/group-packages";

const STANDARD_GROUPS = [
  {
    name: "Administrators",
    description: "Full panel administrators",
    isReseller: false,
    sortOrder: 0,
    color: "#e74c3c",
    groupRole: "admin" as const,
  },
  {
    name: "Resellers",
    description: "Top-level resellers",
    isReseller: true,
    sortOrder: 10,
    color: "#22c55e",
    groupRole: "reseller" as const,
  },
  {
    name: "Sub-resellers",
    description: "Resellers under a parent reseller",
    isReseller: true,
    sortOrder: 20,
    color: "#e67e22",
    groupRole: "sub_reseller" as const,
  },
] as const;

const SUB_RESELLER_GROUP_ALIASES = [
  "sub-resellers",
  "sub-reseller",
  "sub reseller",
  "subreseller",
  "subresellers",
];

async function dedupeSubResellerGroups(prisma: PrismaClient) {
  const all = await prisma.userGroup.findMany({
    where: { isReseller: true },
    orderBy: { createdAt: "asc" },
  });
  const matches = all.filter((g) =>
    SUB_RESELLER_GROUP_ALIASES.includes(g.name.trim().toLowerCase())
  );
  if (matches.length <= 1) return;

  const canonical =
    matches.find((g) => g.name === "Sub-resellers") ??
    matches.find((g) => g.name.toLowerCase() === "sub-resellers") ??
    matches[0]!;

  for (const dup of matches) {
    if (dup.id === canonical.id) continue;
    await prisma.panelUser.updateMany({
      where: { groupId: dup.id },
      data: { groupId: canonical.id },
    });
    await prisma.userGroup.delete({ where: { id: dup.id } }).catch(() => {});
  }

  await prisma.userGroup.update({
    where: { id: canonical.id },
    data: { name: "Sub-resellers", description: "Resellers under a parent reseller" },
  });
}

/** Ensure Administrator / Reseller / Sub-reseller groups exist with standard packages. */
export async function ensureStandardUserGroups(prisma: PrismaClient) {
  const packageIds = await ensureStandardGroupPackages(prisma);
  const byName = new Map<string, string>();

  for (const g of STANDARD_GROUPS) {
    const existing = await prisma.userGroup.findFirst({
      where: {
        OR: [
          { name: g.name },
          { name: { equals: g.name.replace(/s$/, ""), mode: "insensitive" } },
          ...(g.name === "Administrators"
            ? [{ name: { equals: "Administrator", mode: "insensitive" as const } }]
            : []),
          ...(g.name === "Resellers"
            ? [{ name: { equals: "Reseller", mode: "insensitive" as const } }]
            : []),
          ...(g.name === "Sub-resellers"
            ? [
                { name: { equals: "Sub-reseller", mode: "insensitive" as const } },
                { name: { equals: "Sub Reseller", mode: "insensitive" as const } },
              ]
            : []),
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    if (existing) {
      const cfg =
        existing.config && typeof existing.config === "object" && !Array.isArray(existing.config)
          ? (existing.config as Record<string, unknown>)
          : {};
      const existingIds = Array.isArray(cfg.packageIds)
        ? (cfg.packageIds as string[]).filter(Boolean)
        : [];
      const merged = [...new Set([...existingIds, ...packageIds])];
      await prisma.userGroup.update({
        where: { id: existing.id },
        data: {
          name: g.name,
          description: existing.description || g.description,
          isReseller: g.isReseller,
          sortOrder: g.sortOrder,
          color: existing.color || g.color,
          config: { ...cfg, packageIds: merged, groupRole: g.groupRole },
        },
      });
      byName.set(g.name, existing.id);
      continue;
    }

    const created = await prisma.userGroup.create({
      data: {
        name: g.name,
        description: g.description,
        isReseller: g.isReseller,
        sortOrder: g.sortOrder,
        color: g.color,
        config: { packageIds, groupRole: g.groupRole },
      },
    });
    byName.set(g.name, created.id);
  }

  await dedupeSubResellerGroups(prisma);

  return byName;
}
