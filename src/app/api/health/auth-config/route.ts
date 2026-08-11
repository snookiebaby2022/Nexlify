import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";

/**
 * Validate that all required secrets are set correctly so admins can diagnose
 * remote-update 403 errors without SSH access.
 *
 * GET /api/health/auth-config — admin-only, returns which secrets are configured.
 */
export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const panelApiSecret = Boolean(
    process.env.PANEL_API_SECRET?.trim() ||
    process.env.NEXLIFY_PANEL_API_SECRET?.trim()
  );
  const panelInternalSecret = Boolean(
    process.env.PANEL_INTERNAL_SECRET?.trim() ||
    process.env.NEXLIFY_PANEL_API_SECRET?.trim() ||
    process.env.PANEL_API_SECRET?.trim()
  );
  const jwtSecret = Boolean(process.env.JWT_SECRET?.trim());
  const cronSecret = Boolean(process.env.CRON_SECRET?.trim());
  const databaseUrl = Boolean(process.env.DATABASE_URL?.trim());

  // Check for placeholder values that were never changed from defaults
  const PLACEHOLDER_PATTERNS = [
    "change-me",
    "your-secret",
    "replace-me",
    "example",
    "placeholder",
  ];
  const isPlaceholder = (val: string | undefined) =>
    PLACEHOLDER_PATTERNS.some((p) => val?.toLowerCase().includes(p));

  const panelApiSecretPlaceholder = isPlaceholder(
    process.env.PANEL_API_SECRET ?? process.env.NEXLIFY_PANEL_API_SECRET
  );
  const panelInternalSecretPlaceholder = isPlaceholder(
    process.env.PANEL_INTERNAL_SECRET ??
      process.env.NEXLIFY_PANEL_API_SECRET ??
      process.env.PANEL_API_SECRET
  );
  const jwtSecretPlaceholder = isPlaceholder(process.env.JWT_SECRET);

  const issues: string[] = [];

  if (!panelApiSecret) {
    issues.push(
      "PANEL_API_SECRET is not set — remote API calls via x-panel-api-key will be rejected"
    );
  } else if (panelApiSecretPlaceholder) {
    issues.push(
      "PANEL_API_SECRET appears to be a placeholder value — update it to a strong random secret"
    );
  }

  if (!panelInternalSecret) {
    issues.push(
      "PANEL_INTERNAL_SECRET is not set — vendor remote update broadcasts will be rejected (403)"
    );
  } else if (panelInternalSecretPlaceholder) {
    issues.push(
      "PANEL_INTERNAL_SECRET appears to be a placeholder value — it must match the vendor PANEL_API_SECRET exactly"
    );
  }

  if (!jwtSecret) {
    issues.push("JWT_SECRET is not set — panel logins will fail");
  } else if (jwtSecretPlaceholder) {
    issues.push("JWT_SECRET appears to be a placeholder value — update it to a strong random string");
  }

  if (!databaseUrl) {
    issues.push("DATABASE_URL is not set — panel will not start");
  }

  const healthy = issues.length === 0;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "misconfigured",
      secrets: {
        panelApiSecret: panelApiSecret
          ? panelApiSecretPlaceholder
            ? "set-but-placeholder"
            : "ok"
          : "missing",
        panelInternalSecret: panelInternalSecret
          ? panelInternalSecretPlaceholder
            ? "set-but-placeholder"
            : "ok"
          : "missing",
        jwtSecret: jwtSecret
          ? jwtSecretPlaceholder
            ? "set-but-placeholder"
            : "ok"
          : "missing",
        cronSecret: cronSecret ? "ok" : "missing",
        databaseUrl: databaseUrl ? "ok" : "missing",
      },
      issues,
      fixHint: issues.length > 0
        ? "Edit your .env file on the server, then restart the panel (e.g. pm2 restart nexlify, or bash scripts/pm2-start.sh)"
        : null,
      at: new Date().toISOString(),
    },
    { status: healthy ? 200 : 422 }
  );
}
