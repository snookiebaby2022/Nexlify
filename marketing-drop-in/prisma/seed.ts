import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "snookiebaby2022@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const DEFAULT_PLANS = [
  {
    name: "7-Day Trial",
    slug: "trial",
    description: "Same full panel as paid tiers — 7 days, 3 servers, no card required.",
    priceCents: 0,
    durationDays: 7,
    maxLines: 10000,
    maxServers: 3,
    badge: "trial",
    sortOrder: 0,
  },
  {
    name: "Starter",
    slug: "starter",
    description: "Full Nexlify panel with entry server capacity. Plugins sold separately.",
    priceCents: 1500,
    durationDays: 30,
    maxLines: 10000,
    maxServers: 3,
    badge: "starter",
    sortOrder: 1,
  },
  {
    name: "Main",
    slug: "main",
    description: "Full panel for growing operators — more stream servers, same software.",
    priceCents: 3000,
    durationDays: 30,
    maxLines: 10000,
    maxServers: 11,
    badge: "popular",
    sortOrder: 2,
  },
  {
    name: "Top Tier",
    slug: "top-tier",
    description: "Maximum servers plus all media & music plugins included in the license.",
    priceCents: 6000,
    durationDays: 30,
    maxLines: 10000,
    maxServers: 51,
    badge: "new",
    sortOrder: 3,
  },
];

async function main() {
  console.log("Seeding marketing database...");

  // Create admin user
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

  // Create default plans
  for (const plan of DEFAULT_PLANS) {
    const existing = await prisma.plan.findUnique({ where: { slug: plan.slug } });
    if (!existing) {
      await prisma.plan.create({ data: plan });
      console.log(`Created plan: ${plan.name} (${plan.slug})`);
    } else {
      console.log(`Plan already exists: ${plan.name} (${plan.slug})`);
    }
  }

  const planCount = await prisma.plan.count();
  console.log(`Total plans: ${planCount}`);
  console.log("Seed complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
