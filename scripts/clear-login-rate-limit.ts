/** Clear IP login lockouts left by smoke test runs. */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const deleted = await prisma.panelSetting.deleteMany({
  where: { key: { startsWith: "login_rl:" } },
});
console.log("cleared login_rl rows", deleted.count);
await prisma.$disconnect();
