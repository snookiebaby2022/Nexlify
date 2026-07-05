import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const LOYALTY_PREFIX = "loyalty:";

export type LoyaltyPoint = {
  lineId: string;
  points: number;
  level: string;
  badges: string[];
};

export async function getLoyaltyPoints(lineId: string): Promise<LoyaltyPoint> {
  const cached = await cacheGet<LoyaltyPoint>(`${LOYALTY_PREFIX}${lineId}`);
  if (cached) return cached;

  const point: LoyaltyPoint = {
    lineId,
    points: 0,
    level: "Bronze",
    badges: [],
  };

  await cacheSet(`${LOYALTY_PREFIX}${lineId}`, point, 86400);
  return point;
}

export async function addLoyaltyPoints(lineId: string, points: number): Promise<LoyaltyPoint> {
  const point = await getLoyaltyPoints(lineId);
  point.points += points;
  if (point.points >= 1000) point.level = "Gold";
  else if (point.points >= 500) point.level = "Silver";
  await cacheSet(`${LOYALTY_PREFIX}${lineId}`, point, 86400);
  return point;
}

export async function awardBadge(lineId: string, badge: string): Promise<boolean> {
  const point = await getLoyaltyPoints(lineId);
  if (!point.badges.includes(badge)) {
    point.badges.push(badge);
    await cacheSet(`${LOYALTY_PREFIX}${lineId}`, point, 86400);
  }
  return true;
}
