import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";

const schema = readFileSync("prisma/schema.prisma", "utf8");

// Always regenerate Prisma client to prevent stale client mismatches
try {
  execSync("npx prisma generate", { stdio: "pipe", timeout: 30000 });
  console.log("prisma generate OK");
} catch (e) {
  console.error("\nERROR: prisma generate failed. Run 'npx prisma generate' manually.\n");
  process.exit(1);
}

function modelBody(name) {
  const m = schema.match(new RegExp(`model ${name}\\s*\\{([^}]*)\\}`, "m"));
  return m ? m[1] : null;
}

if (existsSync("src/lib/cron-scheduler.ts")) {
  console.error(
    "\nERROR: src/lib/cron-scheduler.ts is legacy (uses node-cron). Delete it:\n" +
      "  rm -f src/lib/cron-scheduler.ts src/instrumentation.ts\n"
  );
  process.exit(1);
}

const instrumentation = "src/instrumentation.ts";
if (existsSync(instrumentation)) {
  const body = readFileSync(instrumentation, "utf8");
  if (body.includes("cron-scheduler") || body.includes("node-cron")) {
    console.error(
      "\nERROR: src/instrumentation.ts must not import cron-scheduler or node-cron.\n" +
        "Delete the file or use an empty register(); cron runs via /api/cron and npm run cron.\n"
    );
    process.exit(1);
  }
}

const bouquet = modelBody("Bouquet");
if (!bouquet || !/sortOrder\s+Int/.test(bouquet)) {
  console.error("\nERROR: model Bouquet must include sortOrder Int\n");
  process.exit(1);
}
if (/creditCost/.test(bouquet)) {
  console.error(
    "\nERROR: Bouquet.creditCost must be removed (credits are for resellers / packages only).\n"
  );
  process.exit(1);
}

const requiredModels = [
  "Ticket",
  "UserGroup",
  "Package",
  "StreamProvider",
  "BlockedAsn",
  "BlockedIp",
  "BlockedIsp",
  "BlockedUserAgent",
  "RtmpEndpoint",
];
const missing = requiredModels.filter((name) => !schema.includes(`model ${name} `));

if (!/enum TicketStatus\s*\{/.test(schema)) {
  missing.push("enum TicketStatus");
}

if (missing.length) {
  console.error(
    "\nERROR: prisma/schema.prisma is outdated. Missing:\n  - " +
      missing.join("\n  - ") +
      "\n\nSync schema from the repo, then run:\n  npx prisma generate\n  npx prisma db push\n"
  );
  process.exit(1);
}

const streamServer = modelBody("StreamServer");
if (!streamServer || !/description\s+String\?/.test(streamServer) || !/rtmpPort\s+Int\?/.test(streamServer)) {
  console.error("\nERROR: model StreamServer must include description, region, rtmpPort, health fields\n");
  process.exit(1);
}

console.log("prisma/schema.prisma OK");
