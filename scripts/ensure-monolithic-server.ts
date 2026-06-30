/**
 * Create or update the main/panel stream server row and agent token (monolithic install).
 * Usage: npx tsx scripts/ensure-monolithic-server.ts --domain panel.example.com
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { generateAgentToken } from "../src/lib/stream-agent";
import {
  RTMP_PORT,
  STREAM_EDGE_HTTP_PORT,
  STREAM_HTTPS_PORT,
} from "../src/lib/server-ports";

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]] != null) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function parseArgs(): { domain: string } {
  const args = process.argv.slice(2);
  let domain = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--domain" && args[i + 1]) domain = args[++i];
  }
  if (!domain) domain = process.env.PANEL_PRIMARY_DOMAIN ?? "";
  if (!domain) throw new Error("--domain required");
  return { domain };
}

function isIpHost(host: string): boolean {
  return /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(host);
}

async function main() {
  loadEnvFile();
  const { domain } = parseArgs();
  const ipMode = isIpHost(domain);
  const streamPort = ipMode
    ? 80
    : Number(process.env.STREAM_HTTP_PORT ?? STREAM_EDGE_HTTP_PORT);
  const httpsPort = Number(process.env.STREAM_HTTPS_PORT ?? STREAM_HTTPS_PORT);
  const rtmpPort = Number(process.env.RTMP_PORT ?? RTMP_PORT);

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.streamServer.findFirst({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    const panelSettings = {
      advanced: {
        serverRole: "main",
        disableDiskRam: false,
        httpPorts: [],
        httpsPorts: [],
        geoIpPriority: "low",
      },
      network: {
        interfaceName: "eth0",
        gateway: "",
        subnetMask: "255.255.255.0",
        dnsServers: "8.8.8.8\n8.8.4.4",
        mtu: 1500,
        ipv6Enabled: false,
      },
    };

    let token = existing?.agentToken;
    if (!token) token = generateAgentToken();

    const data = {
      name: "Main Server",
      host: ipMode ? domain : domain,
      domain: ipMode ? null : domain,
      port: streamPort,
      httpsPort,
      rtmpPort,
      protocol: ipMode ? "http" : "https",
      maxClients: 1000,
      isActive: true,
      sortOrder: 0,
      healthStatus: "online",
      healthMessage: "Main server (panel + stream engine)",
      agentToken: token,
      panelSettings,
    };

    let serverId: string;
    if (existing) {
      await prisma.streamServer.update({ where: { id: existing.id }, data });
      serverId = existing.id;
      console.log(`[monolithic] Updated main server ${serverId}`);
    } else {
      const created = await prisma.streamServer.create({ data });
      serverId = created.id;
      console.log(`[monolithic] Created main server ${serverId}`);
    }

    const tokenFile = path.join(process.cwd(), ".nexlify-agent-token");
    fs.writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
    console.log(`[monolithic] Agent token written to ${tokenFile}`);
    console.log(`AGENT_TOKEN=${token}`);
    console.log(`SERVER_ID=${serverId}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
