import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { findProviderBackupMatches } from "@/lib/provider-backup-match";
import { PanelRole } from "@prisma/client";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([
    PanelRole.ADMIN,
    PanelRole.RESELLER,
    PanelRole.SUB_RESELLER,
  ]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  const primaryUrl = (req.nextUrl.searchParams.get("primaryUrl") ?? "").trim();
  const streamId = req.nextUrl.searchParams.get("streamId")?.trim() || undefined;
  const excludeProviderId = req.nextUrl.searchParams.get("excludeProviderId")?.trim() || undefined;

  if (name.length < 2) {
    return NextResponse.json({ error: "name required (min 2 chars)" }, { status: 400 });
  }

  const matches = await findProviderBackupMatches({
    name,
    primaryUrl: primaryUrl || undefined,
    streamId,
    excludeProviderId,
  });

  return NextResponse.json({ matches, backupUrl: matches[0]?.streamUrl ?? null });
}
