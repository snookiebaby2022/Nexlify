#!/usr/bin/env node
/** Reset marketing admin password from ADMIN_PASSWORD in .env */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("./src/generated/prisma/client");

const ROOT = process.env.NEXLIFY_MARKETING_PATH || "/var/www/nexlify";
process.chdir(ROOT);

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

async function main() {
  const env = loadEnv(path.join(ROOT, ".env"));
  const email = (process.argv[2] || "admin@nexlify.live").toLowerCase();
  const password = process.argv[3] || env.ADMIN_PASSWORD;

  if (!password || password.length < 8) {
    console.error("Set ADMIN_PASSWORD in .env (min 8 chars) or pass: node script.js email password");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await prisma.user.create({
      data: { email, passwordHash: hash, name: "Admin", role: "ADMIN" },
    });
    console.log(`Created admin user ${email}`);
  } else {
    await prisma.user.update({
      where: { email },
      data: { passwordHash: hash, role: "ADMIN" },
    });
    console.log(`Updated password for ${email}`);
  }

  const ok = await bcrypt.compare(password, (await prisma.user.findUnique({ where: { email } })).passwordHash);
  console.log(ok ? "Verify: password OK" : "Verify: FAILED");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
