import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { validateLineCredential } from "@/lib/credential-generate";
import { generatePassword } from "@/lib/xui-api-utils";
import { createWebplayerLinkToken } from "@/lib/webplayer-link";

export type ShopLineResult = {
  id: string;
  username: string;
  password: string;
  expiresAt: Date;
  shopPriceCents: number;
};

/** M3U still needs Xtream creds; webplayer uses a short-lived token so the password stays out of the page URL. */
export async function shopUrls(
  origin: string,
  line: { id: string; username: string; password: string }
) {
  const t = await createWebplayerLinkToken(line.id);
  return {
    portal: `${origin}/portal`,
    m3u: `${origin}/get.php?username=${encodeURIComponent(line.username)}&password=${encodeURIComponent(line.password)}&type=m3u_plus&output=ts`,
    webplayer: `${origin}/webplayer?t=${encodeURIComponent(t)}`,
  };
}

export async function createLineFromShopPackage(opts: {
  packageId: string;
  username?: string;
  password?: string;
}): Promise<ShopLineResult> {
  const pkg = await prisma.package.findFirst({
    where: { id: opts.packageId, isActive: true, shopEnabled: true },
  });
  if (!pkg) throw new Error("Package not available");

  let username = String(opts.username ?? "").trim();
  let password = String(opts.password ?? "").trim() || generatePassword();
  if (!username) username = `shop_${Date.now().toString(36)}`;
  const userErr = validateLineCredential(username, "username");
  if (userErr) throw new Error(userErr);
  const passErr = validateLineCredential(password, "password");
  if (passErr) throw new Error(passErr);

  const existing = await prisma.line.findUnique({ where: { username } });
  if (existing) throw new Error("Username taken");

  const { assertIptvTrialAllowed, isIptvTrialPackageMeta } = await import("@/lib/iptv-trial-lines");
  const isTrial = isIptvTrialPackageMeta({
    name: pkg.name,
    days: pkg.days,
    creditCost: pkg.creditCost,
    shopPriceCents: pkg.shopPriceCents,
  });
  const trialGuard = await assertIptvTrialAllowed({ isTrial });
  if (!trialGuard.ok) throw new Error(trialGuard.error);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Math.max(1, pkg.days));

  const line = await prisma.line.create({
    data: {
      username,
      password,
      maxConnections: Math.max(1, pkg.maxLines),
      expiresAt,
      isTrial,
      bouquets: {
        create: pkg.bouquetIds.map((bouquetId) => ({ bouquetId })),
      },
    },
  });
  await logActivity("shop_create_line", {
    lineId: line.id,
    entity: "line",
    entityId: line.id,
    meta: { packageId: pkg.id, shopPriceCents: pkg.shopPriceCents },
  });

  return {
    id: line.id,
    username,
    password,
    expiresAt,
    shopPriceCents: pkg.shopPriceCents,
  };
}
