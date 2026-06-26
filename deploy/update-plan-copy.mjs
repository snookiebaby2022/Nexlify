import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaBetterSqlite3({ url: "file:./data/nexlify.db" });
const prisma = new PrismaClient({ adapter });

const updates = [
  {
    slug: "trial",
    description: "Run the full Nexlify panel free for a week — no card required.",
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
    slug: "starter",
    description: "Everything you need to launch — without the enterprise price tag.",
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
    slug: "main",
    description: "For operators who are growing fast and need room to scale.",
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
    slug: "top-tier",
    description: "The complete Nexlify stack — every plugin unlocked, maximum capacity.",
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

for (const u of updates) {
  const r = await prisma.plan.updateMany({
    where: { slug: u.slug },
    data: { description: u.description, featuresJson: u.featuresJson },
  });
  console.log(`updated ${u.slug}: ${r.count} row(s)`);
}

await prisma.$disconnect();
