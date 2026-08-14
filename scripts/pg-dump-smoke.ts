/**
 * Smoke tests for pg_dump URL parsing (no database required).
 * Run: npx tsx scripts/pg-dump-smoke.ts
 */
import { parseDatabaseUrl, sanitizePgDumpError } from "../src/lib/pg-dump";
import { cronMatchesThisHour } from "../src/lib/backup-schedule";

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    console.error(`FAIL ${name}\n  got  ${a}\n  want ${b}`);
    failed++;
  } else {
    console.log(`ok   ${name}`);
  }
}

const basic = parseDatabaseUrl("postgresql://nexlify:secret@localhost:5432/nexlify");
eq("host", basic.host, "localhost");
eq("port", basic.port, "5432");
eq("user", basic.user, "nexlify");
eq("password", basic.password, "secret");
eq("database", basic.database, "nexlify");

const prisma = parseDatabaseUrl(
  'postgresql://nexlify:secret@127.0.0.1:5432/nexlify?schema=public&connection_limit=10&pool_timeout=20'
);
eq("prisma schema stripped (still parses)", prisma.database, "nexlify");
eq("prisma host", prisma.host, "127.0.0.1");

const encoded = parseDatabaseUrl("postgresql://nexlify:p%40ss%3Aword@localhost:5432/nexlify");
eq("encoded password", encoded.password, "p@ss:word");

const quoted = parseDatabaseUrl('"postgresql://nexlify:x@localhost:5432/nexlify"');
eq("quoted url", quoted.user, "nexlify");

const postgresScheme = parseDatabaseUrl("postgres://nexlify:x@db.internal:5433/panel");
eq("postgres:// scheme", postgresScheme.port, "5433");
eq("postgres:// db", postgresScheme.database, "panel");

const leaked = sanitizePgDumpError(
  'Command failed: pg_dump "postgresql://nexlify:hunter2@localhost:5432/nexlify?schema=public"'
);
eq("sanitize strips userinfo", leaked.includes("hunter2"), false);
eq("sanitize keeps host hint", leaked.includes("localhost"), true);

try {
  parseDatabaseUrl("mysql://root@localhost/db");
  console.error("FAIL expected mysql url to throw");
  failed++;
} catch {
  console.log("ok   reject mysql url");
}

const atFour = new Date(Date.UTC(2026, 7, 14, 4, 17, 0));
eq("schedule matches hour despite minute", cronMatchesThisHour("0 4 * * *", atFour), true);
eq("schedule skips other hour", cronMatchesThisHour("0 4 * * *", new Date(Date.UTC(2026, 7, 14, 5, 0, 0))), false);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall pg-dump smokes passed");
