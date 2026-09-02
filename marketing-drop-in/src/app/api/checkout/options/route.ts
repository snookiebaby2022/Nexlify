import { NextResponse } from "next/server";
import { isPayPalConfigured, isStripeConfigured } from "@/lib/billing-settings";

export async function GET() {
  return NextResponse.json({
    stripe: isStripeConfigured(),
    paypal: isPayPalConfigured(),
    defaultCurrency: "GBP",
  });
}
