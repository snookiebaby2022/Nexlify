import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

const plans = [
  {
    name: "7-Day Trial",
    slug: "trial",
    description: "Run the full Nexlify panel free for a week — no card required.",
    priceCents: 0,
    durationDays: 7,
    maxLines: 10000,
    maxServers: 3,
    whmcsProductId: null,
    badge: "trial",
    sortOrder: 0,
    featuresJson: JSON.stringify({
      servers: 3,
      lines: "Unlimited",
      maxMainServers: 1,
      maxLoadBalancers: 2,
      allPlugins: false,
      highlights: [
        "Full Starter panel for 7 days",
        "Unlimited lines — real production limits",
        "One free trial per account",
        "Upgrade anytime to keep your setup",
      ],
    }),
  },
  {
    name: "Starter",
    slug: "starter",
    description: "Everything you need to launch — without the enterprise price tag.",
    priceCents: 5000,
    durationDays: 30,
    maxLines: 10000,
    maxServers: 3,
    whmcsProductId: 1,
    badge: "starter",
    sortOrder: 1,
    featuresJson: JSON.stringify({
      servers: 3,
      lines: "Unlimited",
      maxMainServers: 1,
      maxLoadBalancers: 2,
      allPlugins: false,
      highlights: [
        "1 main panel + 2 load balancers",
        "Reseller & back-office built in",
        "Web player your subscribers can use",
        "License delivered instantly at checkout",
        "Add media & music plugins à la carte",
      ],
    }),
  },
  {
    name: "Main",
    slug: "main",
    description: "For operators who are growing fast and need room to scale.",
    priceCents: 15000,
    durationDays: 30,
    maxLines: 10000,
    maxServers: 11,
    whmcsProductId: 2,
    badge: "popular",
    sortOrder: 2,
    featuresJson: JSON.stringify({
      servers: 11,
      lines: "Unlimited",
      maxMainServers: 1,
      maxLoadBalancers: 10,
      allPlugins: false,
      highlights: [
        "1 main panel + 10 load balancers",
        "Everything in Starter, plus more headroom",
        "Priority support (~1 hour response)",
        "WHMCS auto suspend & renew sync",
        "Scale streams without switching platforms",
      ],
    }),
  },
  {
    name: "Top Tier",
    slug: "top-tier",
    description: "The complete Nexlify stack — every plugin unlocked, maximum capacity.",
    priceCents: 35000,
    durationDays: 30,
    maxLines: 10000,
    maxServers: 51,
    whmcsProductId: 3,
    badge: "new",
    sortOrder: 3,
    featuresJson: JSON.stringify({
      servers: 51,
      lines: "Unlimited",
      maxMainServers: 1,
      maxLoadBalancers: 50,
      allPlugins: true,
      highlights: [
        "1 main panel + 50 load balancers",
        "Every plugin included — no add-ons needed",
        "Plex, Emby, Jellyfin, Spotify & more",
        "Fastest support (~30 min response)",
        "Best value if you want everything unlocked",
      ],
    }),
  },
];

const addonProducts = [
  { name: "Plex Plugin", service: "plex", whmcsProductId: 4, sortOrder: 1 },
  { name: "Emby Plugin", service: "emby", whmcsProductId: 5, sortOrder: 2 },
  { name: "Jellyfin Plugin", service: "jellyfin", whmcsProductId: 6, sortOrder: 3 },
  { name: "YouTube Plugin", service: "youtube", whmcsProductId: 7, sortOrder: 4 },
  { name: "Spotify Plugin", service: "spotify", whmcsProductId: 8, sortOrder: 5 },
  { name: "Apple Music Plugin", service: "apple_music", whmcsProductId: 9, sortOrder: 6 },
  { name: "Deezer Plugin", service: "deezer", whmcsProductId: 10, sortOrder: 7 },
  { name: "YouTube Music Plugin", service: "youtube_music", whmcsProductId: 11, sortOrder: 8 },
  { name: "Statistics Plugin", service: "statistics", whmcsProductId: 12, sortOrder: 9 },
];

const retiredSlugs = [
  "ignite",
  "apex",
  "nova",
  "titan",
  "launch",
  "operator",
  "network",
];

async function main() {
  await prisma.plan.updateMany({
    where: { slug: { in: retiredSlugs } },
    data: { active: false },
  });

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
  }

  for (const addon of addonProducts) {
    await prisma.addonProduct.upsert({
      where: { service: addon.service },
      update: addon,
      create: addon,
    });
  }

  await prisma.addonProduct.updateMany({
    where: { service: "proxy_plugins" },
    data: { active: false },
  });

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@nexlify.live";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123456";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Administrator",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(adminPassword, 12),
    },
  });

  const demoEmail = "demo@nexlify.live";
  const demoKey =
    process.env.NEXT_PUBLIC_DEMO_LICENSE_KEY ?? "XSTR-DEMO-NXLF-LIVE-PANEL";
  const starter = await prisma.plan.findUnique({ where: { slug: "starter" } });

  if (starter) {
    const demoUser = await prisma.user.upsert({
      where: { email: demoEmail },
      update: {},
      create: {
        email: demoEmail,
        name: "Demo Account",
        passwordHash: await bcrypt.hash("demo123456", 12),
      },
    });

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 5);

    await prisma.license.upsert({
      where: { key: demoKey },
      update: {
        status: "ACTIVE",
        expiresAt,
        maxLines: starter.maxLines,
        notes: "Public demo license for nexlify.live/panel",
      },
      create: {
        key: demoKey,
        userId: demoUser.id,
        planId: starter.id,
        status: "ACTIVE",
        expiresAt,
        maxLines: starter.maxLines,
        notes: "Public demo license",
      },
    });
    console.log("Demo license:", demoKey);
  }

  const trialCode =
    process.env.TRIAL_PROMO_CODE ??
    process.env.NEXT_PUBLIC_TRIAL_PROMO_CODE ??
    "XSTR-TRIAL-7DAY-NXLF";
  console.log("Trial promo code (redeem after signup):", trialCode);
  console.log("Seeded plans (WHMCS IDs 1–3) + addon products (IDs 4–12) and admin:", adminEmail);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
