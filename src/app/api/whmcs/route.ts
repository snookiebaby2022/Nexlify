import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWhmcsApiKey } from "@/lib/whmcs-auth";
import {
  licensePayload,
  whmcsProvision,
  whmcsSuspend,
  whmcsTerminate,
  whmcsUnsuspend,
} from "@/lib/whmcs";
import { isAddonProductId, isAddonWhmcsService } from "@/lib/addon-entitlements";
import {
  addonEntitlementPayload,
  whmcsAddonProvision,
  whmcsAddonSuspend,
  whmcsAddonTerminate,
  whmcsAddonUnsuspend,
} from "@/lib/whmcs-addons";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    serviceId: z.string().min(1),
    productId: z.coerce.number().int().positive(),
    email: z.string().email(),
    clientName: z.string().optional(),
    billingCycle: z.string().optional(),
  }),
  z.object({
    action: z.literal("renew"),
    serviceId: z.string().min(1),
    productId: z.coerce.number().int().positive(),
    email: z.string().email(),
    billingCycle: z.string().optional(),
  }),
  z.object({
    action: z.literal("suspend"),
    serviceId: z.string().min(1),
    productId: z.coerce.number().int().positive().optional(),
  }),
  z.object({
    action: z.literal("unsuspend"),
    serviceId: z.string().min(1),
    productId: z.coerce.number().int().positive().optional(),
  }),
  z.object({
    action: z.literal("terminate"),
    serviceId: z.string().min(1),
    productId: z.coerce.number().int().positive().optional(),
  }),
]);

async function isAddonAction(productId?: number, serviceId?: string): Promise<boolean> {
  if (productId && (await isAddonProductId(productId))) return true;
  if (serviceId && (await isAddonWhmcsService(serviceId))) return true;
  return false;
}

export async function POST(request: Request) {
  if (!requireWhmcsApiKey(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const addon =
      "productId" in body
        ? await isAddonAction(body.productId, body.serviceId)
        : await isAddonAction(undefined, body.serviceId);

    if (body.action === "create" || body.action === "renew") {
      if (addon) {
        const result = await whmcsAddonProvision({
          serviceId: body.serviceId,
          productId: body.productId,
          email: body.email,
          billingCycle: body.billingCycle,
        });
        if ("entitlements" in result) {
          const first = result.entitlements[0];
          return NextResponse.json({
            success: true,
            action: result.action,
            ...addonEntitlementPayload(first, result.product, {
              bundleServices: result.bundleServices,
            }),
          });
        }
        return NextResponse.json({
          success: true,
          action: result.action,
          ...addonEntitlementPayload(result.entitlement, result.product),
        });
      }

      const result = await whmcsProvision({
        serviceId: body.serviceId,
        productId: body.productId,
        email: body.email,
        clientName: "clientName" in body ? body.clientName : undefined,
        billingCycle: body.billingCycle,
      });
      return NextResponse.json({
        success: true,
        action: result.action,
        type: "panel",
        ...licensePayload(result.license),
      });
    }

    if (addon) {
      if (body.action === "suspend") {
        const row = await whmcsAddonSuspend(body.serviceId);
        const product = await import("@/lib/prisma").then((m) =>
          m.prisma.addonProduct.findFirst({ where: { service: row.service } })
        );
        return NextResponse.json({
          success: true,
          ...addonEntitlementPayload(row, product ?? { name: row.service, service: row.service }),
        });
      }
      if (body.action === "unsuspend") {
        const row = await whmcsAddonUnsuspend(body.serviceId);
        const product = await import("@/lib/prisma").then((m) =>
          m.prisma.addonProduct.findFirst({ where: { service: row.service } })
        );
        return NextResponse.json({
          success: true,
          ...addonEntitlementPayload(row, product ?? { name: row.service, service: row.service }),
        });
      }
      const row = await whmcsAddonTerminate(body.serviceId);
      const product = await import("@/lib/prisma").then((m) =>
        m.prisma.addonProduct.findFirst({ where: { service: row.service } })
      );
      return NextResponse.json({
        success: true,
        ...addonEntitlementPayload(row, product ?? { name: row.service, service: row.service }),
      });
    }

    if (body.action === "suspend") {
      const license = await whmcsSuspend(body.serviceId);
      return NextResponse.json({ success: true, type: "panel", ...licensePayload(license) });
    }

    if (body.action === "unsuspend") {
      const license = await whmcsUnsuspend(body.serviceId);
      return NextResponse.json({ success: true, type: "panel", ...licensePayload(license) });
    }

    const license = await whmcsTerminate(body.serviceId);
    return NextResponse.json({ success: true, type: "panel", ...licensePayload(license) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "WHMCS action failed";
    if (e instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
