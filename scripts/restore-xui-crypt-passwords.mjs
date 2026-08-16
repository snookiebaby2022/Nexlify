#!/usr/bin/env node
/**
 * Restore XUI SHA-512 crypt ($6$) reseller/admin passwords that were
 * incorrectly re-hashed with bcrypt during migrate.
 *
 * Usage (on panel host):
 *   node scripts/restore-xui-crypt-passwords.mjs /tmp/xui-users-passwords.json
 *   # or pass a MySQL dump and extract first:
 *   python3 /tmp/extract-xui-users-passwords.py dump.sql /tmp/xui-users-passwords.json
 *   node scripts/restore-xui-crypt-passwords.mjs /tmp/xui-users-passwords.json
 */
const fs = require("fs");
const path = require("path");

async function main() {
  const mapPath = process.argv[2] || "/tmp/xui-users-passwords.json";
  if (!fs.existsSync(mapPath)) {
    console.error("Missing password map:", mapPath);
    process.exit(1);
  }
  const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const bcrypt = require("bcryptjs");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const BCRYPT = /^\$2[aby]\$\d{2}\$/;

  const users = await prisma.panelUser.findMany({
    select: { id: true, username: true, role: true, passwordHash: true, passwordPlain: true },
  });

  let restored = 0;
  let skipped = 0;
  let missing = 0;
  const skipUsernames = new Set(
    (process.env.SKIP_USERNAMES || "admin")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  for (const u of users) {
    if (skipUsernames.has(u.username)) {
      skipped++;
      continue;
    }
    // Keep accounts that already have a known plaintext (manual reset).
    if (u.passwordPlain && String(u.passwordPlain).length > 0 && !String(u.passwordPlain).startsWith("$6$")) {
      skipped++;
      continue;
    }
    const crypt = map[u.username] || map[Object.keys(map).find((k) => k.toLowerCase() === u.username.toLowerCase()) || ""];
    if (!crypt || !String(crypt).startsWith("$6$")) {
      missing++;
      continue;
    }
    // Only rewrite when current hash is bcrypt(crypt) or unrelated bcrypt without plain.
    if (BCRYPT.test(u.passwordHash)) {
      const isBcryptOfCrypt = await bcrypt.compare(crypt, u.passwordHash);
      if (!isBcryptOfCrypt && u.passwordPlain) {
        skipped++;
        continue;
      }
      await prisma.panelUser.update({
        where: { id: u.id },
        data: { passwordHash: crypt, passwordPlain: null },
      });
      restored++;
      console.log("restored", u.role, u.username);
    } else if (u.passwordHash === crypt) {
      skipped++;
    } else if (u.passwordHash.startsWith("$6$")) {
      skipped++;
    } else {
      await prisma.panelUser.update({
        where: { id: u.id },
        data: { passwordHash: crypt, passwordPlain: null },
      });
      restored++;
      console.log("restored-force", u.role, u.username);
    }
  }

  console.log(JSON.stringify({ restored, skipped, missing, total: users.length, mapSize: Object.keys(map).length }));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
