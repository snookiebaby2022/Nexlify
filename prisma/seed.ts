import { PrismaClient, PanelRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Minimal seed — admin user + panel name only (no demo lines/streams). */
async function main() {
  const adminHash = await bcrypt.hash("admin123", 10);

  await prisma.panelUser.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash: adminHash,
      role: PanelRole.ADMIN,
      credits: 999999,
      accessCode: "adminapi",
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
  .catch(console.error)
  .finally(() => prisma.$disconnect());
