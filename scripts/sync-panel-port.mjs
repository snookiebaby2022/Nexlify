/**

 * Sync panel + website ports in DB settings from .env (or argv).

 * Usage: node scripts/sync-panel-port.mjs [panelPort] [websitePort]

 */

import { readFileSync, existsSync } from "fs";

import { resolve, dirname } from "path";

import { fileURLToPath } from "url";

import { PrismaClient } from "@prisma/client";



const __dirname = dirname(fileURLToPath(import.meta.url));

const root = resolve(__dirname, "..");



function loadEnvPorts() {

  const envPath = resolve(root, ".env");

  if (!existsSync(envPath)) return { panel: null, website: null };

  const text = readFileSync(envPath, "utf8");

  let panel = null;

  let website = null;

  for (const line of text.split(/\r?\n/)) {

    const panelM = line.match(/^\s*(?:PORT|PANEL_PORT)\s*=\s*(\d+)/);

    if (panelM) panel = Number(panelM[1]);

    const webM = line.match(/^\s*(?:WEBSITE_PORT|STREAM_HTTP_PORT)\s*=\s*(\d+)/);

    if (webM) website = Number(webM[1]);

  }

  return { panel, website };

}



const envPorts = loadEnvPorts();

const panelPort =

  process.argv[2] && Number(process.argv[2]) > 0

    ? Number(process.argv[2])

    : envPorts.panel ?? 3000;

const websitePort =

  process.argv[3] && Number(process.argv[3]) > 0

    ? Number(process.argv[3])

    : envPorts.website ?? 3001;



const prisma = new PrismaClient();



async function main() {

  const key = "settings.server";

  const row = await prisma.panelSetting.findUnique({ where: { key } });

  let data = {

    panelPort,

    streamHttpPort: websitePort,

    streamHttpsPort: 443,

    panelSslPort: 443,

  };

  if (row?.value) {

    try {

      data = { ...JSON.parse(row.value), panelPort, streamHttpPort: websitePort };

    } catch {

      /* use defaults */

    }

  }

  await prisma.panelSetting.upsert({

    where: { key },

    create: { key, value: JSON.stringify(data) },

    update: { value: JSON.stringify(data) },

  });

  console.log(

    `settings.server: panelPort=${panelPort}, streamHttpPort (website)=${websitePort}`

  );

}



main()

  .catch((e) => {

    console.error(e);

    process.exit(1);

  })

  .finally(() => prisma.$disconnect());

