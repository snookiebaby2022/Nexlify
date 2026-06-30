import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { issueLicenseForOrder, planLimitsFromPlan, validateLicenseKey } from "@/lib/licensing";

function requireWhmcsKey(request: Request): boolean {
  const expected = process.env.WHMCS_API_SECRET?.trim();
  if (!expected) return false;
  const got = request.headers.get("x-whmcs-api-key")?.trim();
  return got === expected;
}

const actionSchema = z.object({
  action: z.string(),
  serviceid: z.union([z.string(), z.number()]).optional(),
  pid: z.union([z.string(), z.number()]).optional(),
  email: z.string().email().optional(),
  key: z.string().optional(),
});

/** WHMCS module callback — create/suspend/validate licenses. */
export async function POST(request: Request) {
  if (!requireWhmcsKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof actionSchema>;
  try {
    body = actionSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  switch (body.action) {
    case "validate": {
      const key = body.key?.trim() ?? "";
      const result = await validateLicenseKey(key);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        limits: planLimitsFromPlan(result.license.plan),
        maxLines: result.license.maxLines,
        expiresAt: result.license.expiresAt?.toISOString() ?? null,
      });
    }
    case "CreateAccount": {
      const email = body.email?.trim();
      const pid = Number(body.pid);
      if (!email || !Number.isFinite(pid)) {
        return NextResponse.json({ error: "email and pid required" }, { status: 400 });
      }
      const plan = await prisma.plan.findFirst({ where: { whmcsProductId: pid, active: true } });
      if (!plan) return NextResponse.json({ error: "Unknown WHMCS product" }, { status: 404 });

      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return NextResponse.json(
          { error: "Customer must register at nexlify.live first" },
          { status: 400 }
        );
      }

      const order = await prisma.order.create({
        data: {
          userId: user.id,
          planId: plan.id,
          amountCents: plan.priceCents,
          status: "COMPLETED",
        },
      });
      const license = await issueLicenseForOrder(order.id);
      if (!license) return NextResponse.json({ error: "Could not issue license" }, { status: 500 });

      if (body.serviceid != null) {
        await prisma.license.update({
          where: { id: license.id },
          data: { whmcsServiceId: String(body.serviceid) },
        });
      }

      return NextResponse.json({
        ok: true,
        licenseKey: license.key,
        limits: planLimitsFromPlan(plan),
      });
    }
    default:
      return NextResponse.json({ ok: true, message: `Action ${body.action} acknowledged` });
  }
}
