const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.line.findFirst({ where: { username: "test123" } }).then(r => {
  console.log("Line:", JSON.stringify(r, null, 2));
  p.$disconnect();
});
