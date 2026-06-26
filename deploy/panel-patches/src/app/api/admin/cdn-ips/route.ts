import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getSettingGroup, setSettingGroup } from "@/lib/panel-settings";
import {
  fetchBunnyIpList,
  fetchCloudflareIpLists,
  nginxRealIpSnippet,
  parseIpList,
} from "@/lib/cdn-ip-ranges";
import { syncPanelSecurityEnv } from "@/lib/panel-security-env";
import { PanelRole } from "@prisma/client";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const security = await getSettingGroup("security");
  const cf4 = parseIpList(String(security.cloudflareIpv4 ?? ""));
  const cf6 = parseIpList(String(security.cloudflareIpv6 ?? ""));
  const bunny = parseIpList(String(security.bunnyIpv4 ?? ""));

  return NextResponse.json({
    cloudflareIpv4: cf4,
    cloudflareIpv6: cf6,
    bunnyIpv4: bunny,
    syncedAt: security.cdnIpsSyncedAt ?? null,
    nginxSnippet: nginxRealIpSnippet({
      cloudflareV4: cf4,
      cloudflareV6: cf6,
      bunnyV4: bunny,
    }),
  });
}

export async function POST() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [cf, bunny] = await Promise.all([fetchCloudflareIpLists(), fetchBunnyIpList()]);
  const security = await getSettingGroup("security");
  const merged = {
    ...security,
    cloudflareIpv4: cf.v4.join("\n"),
    cloudflareIpv6: cf.v6.join("\n"),
    bunnyIpv4: bunny.join("\n"),
    cdnIpsSyncedAt: new Date().toISOString(),
  };
  await setSettingGroup("security", merged);
  syncPanelSecurityEnv(merged);

  return NextResponse.json({
    ok: true,
    counts: { cloudflareV4: cf.v4.length, cloudflareV6: cf.v6.length, bunny: bunny.length },
    syncedAt: merged.cdnIpsSyncedAt,
    nginxSnippet: nginxRealIpSnippet({
      cloudflareV4: cf.v4,
      cloudflareV6: cf.v6,
      bunnyV4: bunny,
    }),
  });
}
