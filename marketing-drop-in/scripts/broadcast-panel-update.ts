/**
 * Push background panel updates to all registered customer panel URLs.
 * Run on nexlify.live: cd /var/www/nexlify && set -a && . ./.env && set +a && npx tsx scripts/broadcast-panel-update.ts
 */
import { prisma } from "../src/lib/prisma";

const secret =
  process.env.PANEL_API_SECRET?.trim() ??
  process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
  "";

async function secretForUrl(panelUrl: string): Promise<string> {
  try {
    const row = await prisma.license.findFirst({
      where: { panelUrl, panelApiSecret: { not: null } },
      orderBy: { activatedAt: "desc" },
      select: { panelApiSecret: true },
    });
    if (row?.panelApiSecret?.trim()) return row.panelApiSecret.trim();
  } catch {
    /* schema may not have panelApiSecret until migrate */
  }
  return secret;
}

function normalizeUrl(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .replace(/\/$/, "");
}

async function triggerUpdate(panelUrl: string) {
  const key = await secretForUrl(panelUrl);
  if (!key) throw new Error("No API secret for panel");
  const res = await fetch(`${panelUrl}/api/internal/panel-update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-panel-internal-secret": key,
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
  };
  return { status: res.status, data };
}

async function main() {
  if (!secret) {
    console.warn("PANEL_API_SECRET not set — will use per-panel secrets from licenses only");
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

  console.log(`Broadcasting update to ${targets.length} panel(s)…\n`);

  let started = 0;
  let skipped = 0;
  let failed = 0;

  for (const { url, email } of targets) {
    process.stdout.write(`${url} (${email}) … `);
    try {
      const { status, data } = await triggerUpdate(url);
      if (data.ok && data.started) {
        console.log(`started (from v${data.fromVersion ?? "?"})`);
        started++;
      } else if (data.ok && data.reason === "already_running") {
        console.log("already updating");
        skipped++;
      } else if (data.ok && data.reason === "already_latest") {
        console.log(`already latest (v${data.fromVersion ?? "?"})`);
        skipped++;
      } else {
        console.log(`FAILED (${status}): ${data.error ?? JSON.stringify(data)}`);
        failed++;
      }
    } catch (e) {
      console.log(`ERROR: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  console.log(`\nDone: ${started} started, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) {
    console.log(
      "\nBootstrap failed panels once:\n  curl -fsSL 'https://nexlify.live/install/fix-panel-auto-update.sh?v=169' | sudo bash"
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
