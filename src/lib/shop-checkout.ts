import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/lines";
import { validateLineCredential } from "@/lib/credential-generate";
import { generatePassword } from "@/lib/xui-api-utils";

export type ShopLineResult = {
  id: string;
  username: string;
  password: string;
  expiresAt: Date;
  shopPriceCents: number;
};

export function shopUrls(origin: string, username: string, password: string) {
  return {
    portal: `${origin}/portal`,
    m3u: `${origin}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=ts`,
    webplayer: `${origin}/webplayer?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
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

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Math.max(1, pkg.days));

  const line = await prisma.line.create({
    data: {
      username,
      password,
      maxConnections: Math.max(1, pkg.maxLines),
      expiresAt,
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
