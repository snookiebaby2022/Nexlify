import { prisma } from "@/lib/prisma";
import { getSettingGroup } from "@/lib/panel-settings";
import { logActivity } from "@/lib/lines";

/** Optionally auto-block VPN/hosting IPs and log the event. */
export async function maybeAutoBlockVpn(opts: {
  clientIp: string;
  lineId?: string;
  isp?: string | null;
  asn?: string | null;
}): Promise<void> {
  const geo = await getSettingGroup("geo");
  if (!geo.autoBlockVpnToBlocklist) return;

  const existing = await prisma.blockedIp.findFirst({
    where: { value: opts.clientIp, isActive: true },
  });
  if (existing) return;

  await prisma.blockedIp.create({
    data: {
      value: opts.clientIp,
      label: "Auto VPN/hosting block",
      reason: [opts.isp, opts.asn].filter(Boolean).join(" · ") || "VPN or hosting detected",
      isActive: true,
    },
  });

  await logActivity("vpn_auto_block", {
    lineId: opts.lineId,
    entity: "ip",
    entityId: opts.clientIp,
    meta: { ip: opts.clientIp, isp: opts.isp, asn: opts.asn },
  });
}
