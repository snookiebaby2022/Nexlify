import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { capturePayPalOrder } from "@/lib/paypal-billing";
import { createLineFromShopPackage, shopUrls } from "@/lib/shop-checkout";

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const pendingId = String(parsed.data.pendingId ?? "").trim();
    const orderId = String(parsed.data.orderId ?? "").trim();
    if (!pendingId && !orderId) {
      return NextResponse.json({ error: "pendingId or orderId required" }, { status: 400 });
    }

    const pending = pendingId
      ? await prisma.billingEvent.findUnique({ where: { id: pendingId } })
      : await prisma.billingEvent.findFirst({
          where: { provider: "shop-paypal", message: orderId },
          orderBy: { createdAt: "desc" },
        });
    if (!pending || pending.provider !== "shop-paypal") {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const origin = req.nextUrl.origin;
    if (pending.status === "ok" && pending.lineId) {
      const line = await prisma.line.findUnique({ where: { id: pending.lineId } });
      if (line) {
        return NextResponse.json({
          ok: true,
          line: { id: line.id, username: line.username, password: line.password, expiresAt: line.expiresAt },
          ...shopUrls(origin, line.username, line.password),
        });
      }
    }

    const paypalOrderId = orderId || String(pending.message ?? "").trim();
    if (!paypalOrderId) return NextResponse.json({ error: "PayPal order missing" }, { status: 400 });

    const captured = await capturePayPalOrder(paypalOrderId);
    if (captured.status !== "COMPLETED" && captured.status !== "APPROVED") {
      return NextResponse.json({ error: `Payment ${captured.status}` }, { status: 402 });
    }

    const payload = (pending.payload ?? {}) as { packageId?: string; username?: string; password?: string };
    if (!payload.packageId) return NextResponse.json({ error: "Package missing" }, { status: 400 });

    const line = await createLineFromShopPackage({
      packageId: payload.packageId,
      username: payload.username,
      password: payload.password,
    });

    await prisma.billingEvent.update({
      where: { id: pending.id },
      data: {
        status: "ok",
        action: "create",
        lineId: line.id,
        message: paypalOrderId,
      },
    });

    return NextResponse.json({
      ok: true,
      line: { id: line.id, username: line.username, password: line.password, expiresAt: line.expiresAt },
      ...shopUrls(origin, line.username, line.password),
    });
  } catch (e) {
    return apiMutationErrorResponse(e, { exposeMessage: true });
  }
}
