import { PrismaClient, PanelRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Minimal seed — admin + demo reseller + panel name (no demo lines/streams). */
async function main() {
  const adminHash = await bcrypt.hash("admin123", 10);
  const resellerHash = await bcrypt.hash("reseller123", 10);

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

  await prisma.panelSetting.upsert({
    where: { key: "panel_name" },
    update: { value: "Nexlify" },
    create: { key: "panel_name", value: "Nexlify" },
  });

  console.log("Seed complete — Nexlify (minimal, no demo content)");
  if (process.env.QUIET_SEED !== "1") {
    console.log("Admin default password is set by install script — not logged here.");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
