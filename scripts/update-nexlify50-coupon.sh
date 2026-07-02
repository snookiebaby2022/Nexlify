#!/bin/bash
set -euo pipefail
cd /home/nexlify-panel
npx prisma db push --accept-data-loss
npx tsx prisma/seed.ts 2>/dev/null || npx tsx -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.coupon.update({
  where: { code: 'NEXLIFY50' },
  data: {
    label: 'Launch 50% off first 3 months',
    discountMonths: 3,
    discountValue: 50,
    isActive: true,
  },
}).then((c) => console.log('OK', c.code, c.discountMonths))
  .finally(() => p.\$disconnect());
"
