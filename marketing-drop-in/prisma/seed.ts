import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "snookiebaby2022@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const UNLIMITED_SERVERS = 9999;
const PAID_PRICE_CENTS = 5000;

const DEFAULT_PLANS = [
  {
    name: "7-Day Trial",
    slug: "trial",
    description:
      "Full panel for 7 days — unlimited servers, all plugins, every feature. No card required.",
    priceCents: 0,
    durationDays: 7,
    maxLines: 100000,
    maxServers: UNLIMITED_SERVERS,
    badge: "trial",
    sortOrder: 0,
    active: true,
  },
  {
    name: "Nexlify License",
    slug: "nexlify",
    description:
      "One simple plan — unlimited stream servers, all media & music plugins, every panel feature included.",
    priceCents: PAID_PRICE_CENTS,
    durationDays: 30,
    maxLines: 100000,
    maxServers: UNLIMITED_SERVERS,
    badge: null,
    sortOrder: 1,
    active: true,
  },
];

const LEGACY_SLUGS = ["starter", "main", "top-tier"];

async function main() {
  console.log("Seeding marketing database...");

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      name: "Admin",
      role: "ADMIN",
    },
  });
  console.log(`Admin user: ${admin.email} (${admin.id})`);

  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        durationDays: plan.durationDays,
        maxLines: plan.maxLines,
        maxServers: plan.maxServers,
        badge: plan.badge,
        sortOrder: plan.sortOrder,
        active: plan.active,
      },
      create: plan,
    });
    console.log(`Upserted plan: ${plan.name} (${plan.slug})`);
  }

  const deactivated = await prisma.plan.updateMany({
    where: { slug: { in: LEGACY_SLUGS } },
    data: { active: false },
  });
  console.log(`Deactivated ${deactivated.count} legacy tier(s)`);

  const planCount = await prisma.plan.count({ where: { active: true } });
  console.log(`Active plans: ${planCount}`);
  console.log("Seed complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
