const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function test() {
  try {
    // Check if table exists
    const result = await p.$queryRaw`SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'LiveConnection'
    )`;
    console.log("Table exists:", result);
    
    // Try to create a connection
    const conn = await p.liveConnection.create({
      data: {
        lineId: "cmr58v049000pkva36i93dwzx",
        streamId: "cmr58thlg000nkva3mj7r9ql4",
        ip: "87.192.105.59",
        userAgent: "VLC/3.0.20",
      },
    });
    console.log("Created connection:", conn);
    
    // Check if it exists
    const conns = await p.liveConnection.findMany();
    console.log("All connections:", conns);
    
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await p.$disconnect();
  }
}

test();
