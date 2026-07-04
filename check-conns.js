const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.liveConnection.findMany({ take: 10, orderBy: { lastSeenAt: "desc" } }).then(r => {
  console.log(JSON.stringify(r, null, 2));
  p.$disconnect();
});
