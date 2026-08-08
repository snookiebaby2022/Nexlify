#!/usr/bin/env node
/** Verify admin user exists and password matches (run on the panel VPS). */
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { loadEnv } = require("./load-env.cjs");

loadEnv();

async function main() {
  const pass = process.argv[2] || process.env.ADMIN_PASS || "";
  if (!pass) {
    console.error("Usage: node scripts/verify-panel-admin-login.cjs <password>");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.panelUser.findUnique({ where: { username: "admin" } });
    if (!user) {
      console.error("ERROR: admin user not found — run: npm run db:seed");
      process.exit(1);
    }
    if (!user.isActive) {
      console.error("ERROR: admin user is disabled");
      process.exit(1);
    }
    const ok = await bcrypt.compare(pass, user.passwordHash);
    console.log("admin user:", user.id);
    console.log("bcrypt match:", ok);
    if (!ok) {
      console.error("ERROR: password does not match database hash");
      process.exit(1);
    }
    console.log("OK: admin password verified");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
