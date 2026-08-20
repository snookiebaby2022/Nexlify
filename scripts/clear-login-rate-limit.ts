/** Clear IP login lockouts left by smoke test runs. */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const deleted = await prisma.panelSetting.deleteMany({
      where: { key: { startsWith: "login_rl:" } },
    });
    console.log("cleared login_rl rows", deleted.count);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
