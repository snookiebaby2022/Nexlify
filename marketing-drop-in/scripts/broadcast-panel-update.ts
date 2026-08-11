/**
 * Push background panel updates to all registered customer panel URLs.
 * Run on nexlify.live: cd /var/www/nexlify && set -a && . ./.env && set +a && npx tsx scripts/broadcast-panel-update.ts
 */
import { prisma } from "../src/lib/prisma";

const secret =
  process.env.PANEL_API_SECRET?.trim() ??
  process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
  "";

/** Maximum parallel requests — avoids hammering panels or hitting OS socket limits. */
const CONCURRENCY = parseInt(process.env.BROADCAST_CONCURRENCY ?? "8", 10);

function normalizeUrl(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .replace(/\/$/, "");
}

async function triggerUpdate(panelUrl: string) {
  const res = await fetch(`${panelUrl}/api/internal/panel-update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-panel-internal-secret": secret,
    },
    body: JSON.stringify({ action: "trigger" }),
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    started?: boolean;
    reason?: string;
    fromVersion?: string;
    error?: string;
    bootstrapUrl?: string;
  };
  return { status: res.status, data };
}

/** Run an array of async tasks with a maximum concurrency limit. */
async function withConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) results.push(await task());
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  if (!secret) {
    console.error("PANEL_API_SECRET / NEXLIFY_PANEL_API_SECRET not set — cannot authenticate to customer panels");
    process.exit(1);
  }

  const rows = await prisma.license.findMany({
    where: { panelUrl: { not: null } },
    select: { panelUrl: true, user: { select: { email: true } } },
    orderBy: { activatedAt: "desc" },
  });

  const seen = new Set<string>();
  const targets: { url: string; email: string }[] = [];
  for (const row of rows) {
    const url = normalizeUrl(row.panelUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    targets.push({ url, email: row.user?.email ?? "?" });
  }

  console.log(`Broadcasting update to ${targets.length} panel(s) (concurrency: ${CONCURRENCY})…\n`);

  let started = 0;
  let skipped = 0;
  let failed = 0;
  const needsBootstrap: string[] = [];

  const tasks = targets.map(({ url, email }) => async () => {
    process.stdout.write(`${url} (${email}) … `);
    try {
      const { status, data } = await triggerUpdate(url);
      if (data.ok && data.started) {
        console.log(`started (from v${data.fromVersion ?? "?"})`);
        started++;
      } else if (data.ok && data.reason === "already_running") {
        console.log("already updating");
        skipped++;
      } else if (status === 409 && data.bootstrapUrl) {
        // Needs one-time bootstrap — tracked separately, not counted as a generic failure
        console.log(`needs bootstrap (${status}): ${data.error}`);
        needsBootstrap.push(url);
      } else {
        console.log(`FAILED (${status}): ${data.error ?? JSON.stringify(data)}`);
        failed++;
      }
    } catch (e) {
      console.log(`ERROR: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  });

  await withConcurrency(tasks, CONCURRENCY);

  console.log(
    `\nDone: ${started} started, ${skipped} skipped, ${failed} failed, ${needsBootstrap.length} need bootstrap`
  );
  if (needsBootstrap.length > 0) {
    console.log("\nThe following panels need a one-time bootstrap before they can receive remote updates:");
    for (const url of needsBootstrap) console.log(`  ${url}`);
    console.log(
      "\nBootstrap each panel by SSH-ing in and running:\n  curl -fsSL 'https://nexlify.live/install/fix-panel-auto-update.sh' | sudo bash"
    );
  }
  if (failed > 0) {
    console.log(
      "\nIf a panel keeps failing, bootstrap it once:\n  curl -fsSL 'https://nexlify.live/install/fix-panel-auto-update.sh' | sudo bash"
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
