import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/portal-session";
import { lineIsPlayable } from "@/lib/lines";
import { serverBaseUrl } from "@/lib/xtream";
import { getSettingGroup } from "@/lib/panel-settings";
import { createWebplayerLinkToken } from "@/lib/webplayer-link";

export async function GET(req: Request) {
  const session = await getPortalSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const line = await prisma.line.findUnique({
    where: { id: session.lineId },
    include: {
      bouquets: { include: { bouquet: { select: { name: true } } } },
      tickets: { orderBy: { updatedAt: "desc" }, take: 1, select: { id: true, status: true } },
    },
  });
  if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const base = serverBaseUrl(req.url, req.headers);
  const billing = await getSettingGroup("billing");
  const stripeCheckout = String(process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_URL ?? "").trim() || null;
  const renewUrl = stripeCheckout;

  const xtreamUrl = `${base}/player_api.php?username=${encodeURIComponent(line.username)}&password=${encodeURIComponent(line.password)}`;
  const m3uUrl = `${base}/get.php?username=${encodeURIComponent(line.username)}&password=${encodeURIComponent(line.password)}&type=m3u_plus&output=ts`;
  const webplayerToken = await createWebplayerLinkToken(line.id);

  return NextResponse.json({
    line: {
      username: line.username,
      status: line.status,
      expiresAt: line.expiresAt,
      maxConnections: line.maxConnections,
      playable: lineIsPlayable(line),
      bouquets: line.bouquets.map((b) => b.bouquet.name),
    },
    endpoints: {
      m3u: m3uUrl,
      m3uDownload: `${m3uUrl}&download=1`,
      xtream: xtreamUrl,
      epg: `${base}/xmltv.php?username=${encodeURIComponent(line.username)}&password=${encodeURIComponent(line.password)}`,
      stalker: `${base}/stalker_portal/c/`,
      magPortal: `${base}/portal.php`,
      webplayer: `${base}/webplayer?t=${encodeURIComponent(webplayerToken)}`,
      portal: `${base}/portal`,
    },
    billing: {
      renewUrl,
      topUpUrl: renewUrl,
      stripeCheckoutUrl: stripeCheckout,
      couponEnabled: billing.couponCheckoutEnabled === true,
    },
    support: {
      ticketId: line.tickets[0]?.id ?? null,
      ticketStatus: line.tickets[0]?.status ?? null,
      ticketUrl: "/portal/support",
      createTicketUrl: "/portal/support?new=1",
    },
  });
}
