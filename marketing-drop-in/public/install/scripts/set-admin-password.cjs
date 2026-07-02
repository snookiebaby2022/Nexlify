#!/usr/bin/env node
/** Set admin panel password after db:seed (used by install-linux.sh). */
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { loadEnv } = require("./load-env.cjs");

loadEnv();

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$/;

async function main() {
  const pass = process.env.ADMIN_PASS || process.env.INSTALL_ADMIN_PASSWORD || "changeme";
  if (!pass || pass.length < 8) {
    console.error("ADMIN_PASS or INSTALL_ADMIN_PASSWORD must be at least 8 characters");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing — ensure .env exists in panel root");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const hash = await bcrypt.hash(pass, 10);
    await prisma.panelUser.upsert({
      where: { username: "admin" },
      update: { passwordHash: hash, isActive: true, role: "ADMIN" },
      create: {
        username: "admin",
        passwordHash: hash,
        role: "ADMIN",
        credits: 999999,
        isActive: true,
      },
    });

    const row = await prisma.panelUser.findUnique({ where: { username: "admin" } });
    const ok = row && BCRYPT_RE.test(row.passwordHash) && (await bcrypt.compare(pass, row.passwordHash));
    if (!ok) {
      console.error("Admin password verify failed after write");
      process.exit(1);
    }
    console.log("Admin password updated");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
