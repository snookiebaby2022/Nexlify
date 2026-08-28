#!/usr/bin/env node
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.liveConnection.deleteMany()
  .then((r) => {
    console.log('[flush-connections] removed', r.count, 'row(s)');
    return prisma.$disconnect();
  })
  .catch((e) => {
    console.error('[flush-connections] error:', e.message || e);
    return prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
