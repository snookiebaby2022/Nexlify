#!/usr/bin/env node
/**
 * Auto-register the installed panel as the main StreamServer
 * Run after: npx prisma db push && npm run db:seed
 *
 * Env: DOMAIN, STREAM_HTTP_PORT, PANEL_HTTP_PORT, DATABASE_URL
 */
const { PrismaClient } = require("@prisma/client");

async function main() {
  const domain = process.env.DOMAIN?.trim();
  if (!domain) {
    console.log("SKIP: No DOMAIN env set — manual server add required.");
    process.exit(0);
  }

  const prisma = new PrismaClient();
  try {
    // Check if any server already exists
    const existing = await prisma.streamServer.findFirst();
    if (existing) {
      console.log(`SKIP: Server already exists (${existing.name}).`);
      return;
    }

    const streamPort = Number(process.env.STREAM_HTTP_PORT || "8080");
    const panelPort = Number(process.env.PANEL_HTTP_PORT || "80");

    // Detect local IP for privateIp field
    let privateIp = null;
    try {
      const { execSync } = require("child_process");
      const ip = execSync(
        "hostname -I 2>/dev/null | awk '{print $1}' || ip route get 1 2>/dev/null | awk '{print $7}' | head -1",
        { encoding: "utf8", shell: true }
      ).trim();
      if (ip && ip.match(/^\d+\.\d+\.\d+\.\d+$/)) privateIp = ip;
    } catch {
      /* ignore */
    }

    const server = await prisma.streamServer.create({
      data: {
        name: domain,
        host: domain,
        port: streamPort,
        protocol: "http",
        maxClients: 1000,
        isActive: true,
        sortOrder: 0, // main server
        description: "Auto-registered during install",
        privateIp,
        domain,
        panelPort,
        healthStatus: "online",
        healthMessage: "Installed and auto-registered",
        httpsPort: 443,
      },
    });

    console.log(`✅ Main server registered: ${server.name} (${server.host}:${server.port})`);
  } catch (err) {
    console.error("❌ Auto-register failed:", err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
