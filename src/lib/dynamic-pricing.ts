import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const PRICING_PREFIX = "pricing:";

export type PricingRule = {
  id: string;
  name: string;
  basePrice: number;
  peakMultiplier: number;
  offPeakMultiplier: number;
  isActive: boolean;
};

export type PricingSuggestion = {
  currentPrice: number;
  suggestedPrice: number;
  reason: string;
  confidence: number;
};

export async function createPricingRule(
  name: string,
  basePrice: number,
  peakMultiplier: number = 1.5,
  offPeakMultiplier: number = 0.8
): Promise<PricingRule> {
  const rule: PricingRule = {
    id: `price_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    basePrice,
    peakMultiplier,
    offPeakMultiplier,
    isActive: true,
  };

  const rules = await getPricingRules();
  rules.push(rule);
  await cacheSet(`${PRICING_PREFIX}rules`, rules, 86400);
  return rule;
}

export async function getPricingRules(): Promise<PricingRule[]> {
  return (await cacheGet<PricingRule[]>(`${PRICING_PREFIX}rules`)) ?? [];
}

export async function deletePricingRule(ruleId: string): Promise<boolean> {
  const rules = await getPricingRules();
  const filtered = rules.filter((r) => r.id !== ruleId);
  await cacheSet(`${PRICING_PREFIX}rules`, filtered, 86400);
  return true;
}

export async function getPricingSuggestion(streamId: string): Promise<PricingSuggestion> {
  const cached = await cacheGet<PricingSuggestion>(`${PRICING_PREFIX}suggest:${streamId}`);
  if (cached) return cached;

  const rules = await getPricingRules();
  const activeRule = rules.find((r) => r.isActive);
  if (!activeRule) {
    return {
      currentPrice: 0,
      suggestedPrice: 0,
      reason: "No pricing rules configured",
      confidence: 0,
    };
  }

  const hour = new Date().getHours();
  const isPeak = hour >= 18 && hour <= 23;
  const multiplier = isPeak ? activeRule.peakMultiplier : activeRule.offPeakMultiplier;
  const suggestedPrice = activeRule.basePrice * multiplier;

  const suggestion: PricingSuggestion = {
    currentPrice: activeRule.basePrice,
    suggestedPrice,
    reason: isPeak ? "Peak hours pricing" : "Off-peak hours pricing",
    confidence: 0.8,
  };

  await cacheSet(`${PRICING_PREFIX}suggest:${streamId}`, suggestion, 300);
  return suggestion;
}
