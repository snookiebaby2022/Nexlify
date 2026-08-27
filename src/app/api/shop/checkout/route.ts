import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { createPayPalOrder, getPayPalConfig } from "@/lib/paypal-billing";
import { createLineFromShopPackage, shopUrls } from "@/lib/shop-checkout";

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const packageId = String(body.packageId ?? "").trim();
    if (!packageId) return NextResponse.json({ error: "packageId required" }, { status: 400 });

    const pkg = await prisma.package.findFirst({
      where: { id: packageId, isActive: true, shopEnabled: true },
    });
    if (!pkg) return NextResponse.json({ error: "Package not available" }, { status: 404 });

    const origin = req.nextUrl.origin;
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "").trim();

    if (pkg.shopPriceCents <= 0) {
      const line = await createLineFromShopPackage({ packageId, username, password });
      return NextResponse.json({
        ok: true,
        paid: true,
        line: { id: line.id, username: line.username, password: line.password, expiresAt: line.expiresAt },
        ...(await shopUrls(origin, line)),
      });
    }

    const paypal = await getPayPalConfig();
    if (!paypal) {
      return NextResponse.json(
        {
          error:
            "This package requires payment. Set PayPal under Admin → Billing, or set the shop price to 0.",
        },
        { status: 503 }
      );
    }

    const pending = await prisma.billingEvent.create({
      data: {
        provider: "shop-paypal",
        action: "pending",
        status: "pending",
        payload: { packageId, username, password },
        message: "",
      },
    });

    const order = await createPayPalOrder({
      amount: pkg.shopPriceCents / 100,
      currency: "GBP",
      description: `Nexlify ${pkg.name}`,
      returnUrl: `${origin}/shop/return?pending=${encodeURIComponent(pending.id)}`,
      cancelUrl: `${origin}/shop?cancelled=1`,
      customId: pending.id,
    });

    await prisma.billingEvent.update({
      where: { id: pending.id },
      data: { message: order.orderId },
    });

    return NextResponse.json({
      ok: true,
      paid: false,
      orderId: order.orderId,
      approveUrl: order.approveUrl,
      pendingId: pending.id,
    });
  } catch (e) {
    return apiMutationErrorResponse(e, { exposeMessage: true });
  }
}
