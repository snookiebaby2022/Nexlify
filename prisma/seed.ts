import { PrismaClient, PanelRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { instantStreamingPanelDefaults } from "../src/lib/panel-settings";

const prisma = new PrismaClient();

function settingKey(group: string) {
  return `settings.${group}`;
}

/** Minimal seed — admin + optional demo reseller. Production uses a random unusable hash until install sets the password. */
async function main() {
  const adminPass =
    process.env.SEED_ADMIN_PASSWORD?.trim() ||
    process.env.INSTALL_ADMIN_PASSWORD?.trim() ||
    "";
  const resellerPass = process.env.SEED_RESELLER_PASSWORD?.trim() || "";
  const adminHash = await bcrypt.hash(adminPass || randomBytes(32).toString("hex"), 12);
  const resellerHash = await bcrypt.hash(resellerPass || randomBytes(32).toString("hex"), 12);

  const admin = await prisma.panelUser.upsert({
    where: { username: "admin" },
    update: { isActive: true },
    create: {
      username: "admin",
      passwordHash: adminHash,
      role: PanelRole.ADMIN,
      credits: 999999,
      accessCode: "adminapi",
    },
  });

  if (resellerPass) {
    await prisma.panelUser.upsert({
      where: { username: "reseller" },
      update: { isActive: true, passwordHash: resellerHash },
      create: {
        username: "reseller",
        passwordHash: resellerHash,
        role: PanelRole.RESELLER,
        credits: 10000,
        accessCode: "resellerapi",
        parentId: admin.id,
      },
    });
  }

  await prisma.panelSetting.upsert({
    where: { key: "panel_name" },
    update: { value: "Nexlify" },
    create: { key: "panel_name", value: "Nexlify" },
  });

  await prisma.panelSetting.upsert({
    where: { key: "settings.general" },
    update: {},
    create: {
      key: "settings.general",
      value: JSON.stringify({
        panelName: "Nexlify",
        timezone: "Europe/London",
        defaultLanguage: "en",
      }),
    },
  });

  const streamingDefaults = instantStreamingPanelDefaults();
  for (const [group, patch] of Object.entries(streamingDefaults)) {
    if (!patch) continue;
    const key = settingKey(group);
    const value =
      group === "streams"
        ? JSON.stringify({ ...patch, _instantStreamingDefaultsV1: true, autoChannelLogos: true })
        : JSON.stringify(patch);
    await prisma.panelSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  console.log("Seed complete — Nexlify (minimal, no demo content)");
  if (process.env.QUIET_SEED !== "1") {
    console.log("Admin password is set by the install script — not logged here.");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
