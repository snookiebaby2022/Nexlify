#!/usr/bin/env npx tsx
/**
 * Seed demo WHMCS-style addon licenses + enable feature pack settings.
 * Run on vendor/demo panel: npx tsx scripts/seed-demo-feature-packs.ts
 */
import { PrismaClient } from "@prisma/client";
import { FEATURE_PACKS } from "../src/lib/feature-packs";

const prisma = new PrismaClient();

const PACK_SETTING_GROUPS: Record<string, string> = {
  transcoding_pro: "transcoding-pack",
  lb_pro: "lb-pro",
  archive_timeshift: "archive-pack",
  security_shield: "security-shield",
  analytics_ai: "analytics-ai",
  dvr_recording: "dvr-pack",
};

const DEMO_EXPIRES = new Date("2099-12-31T23:59:59.000Z");

async function upsertLicense(service: string, label: string) {
  const existing = await prisma.addonLicense.findFirst({
    where: { service },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return prisma.addonLicense.update({
      where: { id: existing.id },
      data: {
        label,
        isActive: true,
        expiresAt: DEMO_EXPIRES,
        notes: "Demo seed — all feature packs active for screenshots",
        licenseKey: existing.licenseKey ?? `DEMO-${service.toUpperCase()}`,
      },
    });
  }
  return prisma.addonLicense.create({
    data: {
      service,
      label,
      licenseKey: `DEMO-${service.toUpperCase()}`,
      expiresAt: DEMO_EXPIRES,
      isActive: true,
      notes: "Demo seed — all feature packs active for screenshots",
    },
  });
}

async function enablePackSetting(group: string) {
  const key = `settings.${group}`;
  const row = await prisma.panelSetting.findUnique({ where: { key } });
  let base: Record<string, unknown> = { enabled: true };
  if (row?.value) {
    try {
      base = { ...(JSON.parse(row.value) as Record<string, unknown>), enabled: true };
    } catch {
      /* use defaults */
    }
  }
  await prisma.panelSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(base) },
    update: { value: JSON.stringify(base) },
  });
}

async function main() {
  console.log("Seeding demo feature pack licenses…");

  const enterprise = await upsertLicense(
    "full_enterprise",
    "Full Enterprise Bundle (Demo)"
  );
  console.log(`  OK full_enterprise (${enterprise.id})`);

  for (const pack of FEATURE_PACKS) {
    if (pack.id === "full_enterprise") continue;
    const lic = await upsertLicense(pack.serviceId, `${pack.name} (Demo)`);
    console.log(`  OK ${pack.serviceId} (${lic.id})`);
    const group = PACK_SETTING_GROUPS[pack.serviceId];
    if (group) {
      await enablePackSetting(group);
      console.log(`  enabled settings.${group}`);
    }
  }

  console.log("\nDone — marketplace should show all packs as Licensed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
