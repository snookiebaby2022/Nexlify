import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

import { getSettingGroup } from "@/lib/panel-settings";

import { redeemCouponCode, toCouponPublicView } from "@/lib/coupon-redeem";



const DEFAULT_PUBLIC_CODE = "NEXLIFY50";



export async function GET(req: NextRequest) {

  const code = String(req.nextUrl.searchParams.get("code") ?? DEFAULT_PUBLIC_CODE)

    .trim()

    .toUpperCase();



  const coupon = await prisma.coupon.findUnique({ where: { code } });

  if (!coupon) {

    return NextResponse.json({ error: "Invalid coupon" }, { status: 404 });

  }



  return NextResponse.json(
    {
      ok: true,
      coupon: toCouponPublicView(coupon),
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60",
      },
    },
  );

}



export async function POST(req: NextRequest) {

  const settings = await getSettingGroup("billing");

  if (!settings.couponCheckoutEnabled) {

    return NextResponse.json({ error: "Coupons disabled" }, { status: 403 });

  }



  const body = await req.json();

  const code = String(body.code ?? "").trim().toUpperCase();

  const days = Number(body.days ?? 30);

  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });



  const coupon = await prisma.coupon.findUnique({ where: { code } });

  if (!coupon || !coupon.isActive) {

    return NextResponse.json({ error: "Invalid coupon" }, { status: 404 });

  }

  if (coupon.expiresAt && coupon.expiresAt < new Date()) {

    return NextResponse.json({ error: "Coupon expired" }, { status: 410 });

  }

  if (coupon.maxUses > 0 && coupon.uses >= coupon.maxUses) {

    return NextResponse.json({ error: "Coupon fully redeemed" }, { status: 410 });

  }

  if (coupon.minDays != null && days < coupon.minDays) {

    return NextResponse.json({ error: `Minimum ${coupon.minDays} days required` }, { status: 400 });

  }



  let discountAmount = 0;

  let discountPercent = 0;

  if (coupon.discountType === "percent") {

    discountPercent = coupon.discountValue;

  } else {

    discountAmount = coupon.discountValue;

  }



  // During free period (until Aug 1, 2026), all coupons give 100% off

  const { isFreePeriod } = await import("@/lib/free-period");

  if (isFreePeriod()) {

    discountPercent = 100;

    discountAmount = 0;

  }



  const publicView = toCouponPublicView(coupon);



  return NextResponse.json({

    ok: true,

    coupon: {

      code: coupon.code,

      label: coupon.label,

      discountType: coupon.discountType,

      discountValue: coupon.discountValue,

      discountPercent,

      discountAmount,

      maxRedemptions: coupon.maxUses,

      redemptionCount: coupon.uses,

      remaining: publicView.remaining,

      percentOff: publicView.percentOff,

      discountMonths: publicView.discountMonths,

      active: publicView.active,

    },

  });

}



export async function PUT(req: NextRequest) {

  const secret = req.headers.get("x-billing-secret");

  const expected = process.env.BILLING_WEBHOOK_SECRET;

  if (!expected || secret !== expected) {

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  const body = await req.json();

  const code = String(body.code ?? "").trim().toUpperCase();

  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });



  const result = await redeemCouponCode(code);

  if (!result.ok) {

    const status = result.error === "Coupon fully redeemed" ? 410 : 404;

    return NextResponse.json({ error: result.error }, { status });

  }



  return NextResponse.json({

    ok: true,

    uses: result.uses,

    remaining: result.remaining,

  });

}

