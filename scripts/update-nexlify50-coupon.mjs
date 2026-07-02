import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const updated = await prisma.coupon.update({
  where: { code: "NEXLIFY50" },
  data: {
    label: "Launch 50% off first 3 months",
    discountMonths: 3,
    discountValue: 50,
    isActive: true,
  },
});

console.log(JSON.stringify({ code: updated.code, discountMonths: updated.discountMonths, label: updated.label }));
await prisma.$disconnect();
