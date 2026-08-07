/**
 * Sync single-plan pricing on VPS (no git required).
 * Run: cd /var/www/nexlify && npx tsx scripts/sync-plans-vps.ts
 */
import { prisma } from "../src/lib/prisma";

const UNLIMITED = 9999;
const PAID_CENTS = 5000;

async function main() {
  await prisma.plan.upsert({
    where: { slug: "trial" },
    update: {
      name: "7-Day Trial",
      description:
        "Full panel for 7 days — unlimited servers, all plugins, every feature. No card required.",
      priceCents: 0,
      durationDays: 7,
      maxLines: 100000,
      maxServers: UNLIMITED,
      badge: "trial",
      sortOrder: 0,
      active: true,
    },
    create: {
      name: "7-Day Trial",
      slug: "trial",
      description:
        "Full panel for 7 days — unlimited servers, all plugins, every feature. No card required.",
      priceCents: 0,
      durationDays: 7,
      maxLines: 100000,
      maxServers: UNLIMITED,
      badge: "trial",
      sortOrder: 0,
      active: true,
    },
  });

  await prisma.plan.upsert({
    where: { slug: "nexlify" },
    update: {
      name: "Nexlify License",
      description:
        "One simple plan — unlimited stream servers, all media & music plugins, every panel feature included.",
      priceCents: PAID_CENTS,
      durationDays: 30,
      maxLines: 100000,
      maxServers: UNLIMITED,
      badge: null,
      sortOrder: 1,
      active: true,
    },
    create: {
      name: "Nexlify License",
      slug: "nexlify",
      description:
        "One simple plan — unlimited stream servers, all media & music plugins, every panel feature included.",
      priceCents: PAID_CENTS,
      durationDays: 30,
      maxLines: 100000,
      maxServers: UNLIMITED,
      badge: null,
      sortOrder: 1,
      active: true,
    },
  });

  const off = await prisma.plan.updateMany({
    where: { slug: { in: ["starter", "main", "top-tier"] } },
    data: { active: false },
  });

  const active = await prisma.plan.findMany({
    where: { active: true },
    select: { slug: true, priceCents: true, maxServers: true },
    orderBy: { sortOrder: "asc" },
  });

  console.log("Deactivated legacy tiers:", off.count);
  console.log("Active plans:", active);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
