import { extendLicense } from "@/lib/admin-license";
import { getAppUrl } from "@/lib/app-url";
import { issueLicenseForOrder } from "@/lib/licensing";
import { sendMarketingEmail } from "@/lib/mail";
import {
  getPayPalSubscription,
  isPayPalSubscriptionActive,
} from "@/lib/paypal-billing";
import { prisma } from "@/lib/prisma";
import { syncLicenseToPanel } from "@/lib/panel-sync";

async function adminEmails(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
  });
  const set = new Set(rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean));
  for (const key of ["SUPPORT_NOTIFY_EMAIL", "ADMIN_EMAIL"] as const) {
    const v = process.env[key]?.trim();
    if (v) set.add(v.toLowerCase());
  }
  return [...set];
}

async function notifyAdminsBilling(subject: string, text: string) {
  try {
    const recipients = await adminEmails();
    await Promise.allSettled(
      recipients.map((to) =>
        sendMarketingEmail({ to, subject: `[Nexlify Billing] ${subject}`, text }),
      ),
    );
  } catch (e) {
    console.error("[paypal-billing] admin notify failed", e);
  }
}

export async function attachPayPalSubscriptionToLicense(opts: {
  orderId: string;
  subscriptionId: string;
  status?: string | null;
}) {
  const license = await prisma.license.findFirst({
    where: { orderId: opts.orderId },
  });
  if (!license) return null;

  return prisma.license.update({
    where: { id: license.id },
    data: {
      paypalSubscriptionId: opts.subscriptionId,
      paypalSubscriptionStatus: opts.status ?? "ACTIVE",
      status:
        license.status === "UNUSED" || license.status === "EXPIRED" ? license.status : "ACTIVE",
      notes:
        (license.notes ? `${license.notes}\n` : "") +
        `[paypal] subscription ${opts.subscriptionId} linked ${new Date().toISOString()}`,
    },
  });
}

export async function fulfillPayPalSubscription(opts: {
  orderId: string;
  subscriptionId: string;
}) {
  const sub = await getPayPalSubscription(opts.subscriptionId);
  if (!isPayPalSubscriptionActive(sub.status)) {
    return { ok: false as const, error: `subscription_${sub.status.toLowerCase()}` };
  }

  const order = await prisma.order.findUnique({
    where: { id: opts.orderId },
    include: { license: true, plan: true },
  });
  if (!order) return { ok: false as const, error: "order_not_found" };
  if (order.paymentProvider !== "paypal") {
    return { ok: false as const, error: "not_paypal_order" };
  }

  if (order.status !== "COMPLETED") {
    await prisma.order.update({
      where: { id: opts.orderId },
      data: {
        status: "COMPLETED",
        paypalSubscriptionId: opts.subscriptionId,
        billingMode: "subscription",
      },
    });
  } else if (!order.paypalSubscriptionId) {
    await prisma.order.update({
      where: { id: opts.orderId },
      data: {
        paypalSubscriptionId: opts.subscriptionId,
        billingMode: "subscription",
      },
    });
  }

  let license = order.license ?? (await issueLicenseForOrder(opts.orderId));
  if (license) {
    license = await attachPayPalSubscriptionToLicense({
      orderId: opts.orderId,
      subscriptionId: opts.subscriptionId,
      status: sub.status,
    });
    await syncLicenseToPanel(license!.id, "ACTIVATE", { licenseKey: license!.key }).catch(
      () => {},
    );
  }

  return { ok: true as const, licenseId: license?.id ?? null };
}

export async function renewLicenseFromPayPalSale(opts: {
  subscriptionId: string;
  saleId?: string;
}) {
  const license = await prisma.license.findFirst({
    where: { paypalSubscriptionId: opts.subscriptionId },
    include: { plan: true, user: { select: { email: true } } },
  });
  if (!license) return { ok: false as const, error: "license_not_found" };

  if (opts.saleId && license.notes?.includes(`[paypal-sale] ${opts.saleId}`)) {
    return { ok: true as const, skipped: true as const };
  }

  const order = license.orderId
    ? await prisma.order.findUnique({ where: { id: license.orderId } })
    : null;
  if (!order || order.status !== "COMPLETED") {
    return { ok: true as const, skipped: true as const };
  }

  const minutesSinceLicense =
    (Date.now() - new Date(license.createdAt).getTime()) / (60 * 1000);
  if (minutesSinceLicense < 5 && !opts.saleId) {
    return { ok: true as const, skipped: true as const };
  }

  const days = license.plan.durationDays || 30;
  const updated = await extendLicense(license.id, days);
  if (!updated) return { ok: false as const, error: "extend_failed" };

  await prisma.license.update({
    where: { id: license.id },
    data: {
      status: "ACTIVE",
      paypalSubscriptionStatus: "ACTIVE",
      notes:
        (license.notes ? `${license.notes}\n` : "") +
        `[paypal-sale] ${opts.saleId ?? "renewal"} ${new Date().toISOString()}`,
    },
  });

  await syncLicenseToPanel(license.id, "REPLACE", { licenseKey: updated.key }).catch(() => {});

  await notifyAdminsBilling(
    `PayPal renewed ${license.user.email}`,
    `Subscription ${opts.subscriptionId} paid. License extended by ${days} days.\nCustomer: ${license.user.email}\nAdmin: ${getAppUrl()}/admin?tab=billing`,
  );

  return { ok: true as const, licenseId: license.id };
}

export async function suspendLicenseFromPayPalFailure(subscriptionId: string) {
  const license = await prisma.license.findFirst({
    where: { paypalSubscriptionId: subscriptionId },
    include: { user: { select: { email: true } } },
  });
  if (!license) return { ok: false as const, error: "license_not_found" };

  await prisma.license.update({
    where: { id: license.id },
    data: {
      status: "SUSPENDED",
      paypalSubscriptionStatus: "SUSPENDED",
      notes:
        (license.notes ? `${license.notes}\n` : "") +
        `[paypal] payment_failed ${new Date().toISOString()}`,
    },
  });

  await syncLicenseToPanel(license.id, "SUSPEND").catch(() => {});

  await notifyAdminsBilling(
    `PayPal payment failed — ${license.user.email}`,
    `Subscription ${subscriptionId} payment failed. License SUSPENDED.\n${getAppUrl()}/admin?tab=billing`,
  );

  return { ok: true as const, licenseId: license.id };
}

export async function handlePayPalSubscriptionCancelled(subscriptionId: string) {
  const license = await prisma.license.findFirst({
    where: { paypalSubscriptionId: subscriptionId },
    include: { user: { select: { email: true } } },
  });
  if (!license) return { ok: false as const, error: "license_not_found" };

  await prisma.license.update({
    where: { id: license.id },
    data: {
      status: "EXPIRED",
      paypalSubscriptionStatus: "CANCELLED",
      notes:
        (license.notes ? `${license.notes}\n` : "") +
        `[paypal] subscription cancelled ${new Date().toISOString()}`,
    },
  });
  await syncLicenseToPanel(license.id, "REVOKE").catch(() => {});

  await notifyAdminsBilling(
    `PayPal subscription cancelled — ${license.user.email}`,
    `Subscription ${subscriptionId} cancelled. License marked EXPIRED.\n${getAppUrl()}/admin?tab=billing`,
  );

  return { ok: true as const };
}

export async function handlePayPalWebhookEvent(event: {
  event_type?: string;
  resource?: Record<string, unknown>;
}) {
  const type = event.event_type ?? "";
  const resource = event.resource ?? {};

  if (type === "BILLING.SUBSCRIPTION.ACTIVATED") {
    const subscriptionId = String(resource.id ?? "");
    const orderId = String(resource.custom_id ?? "").trim();
    if (subscriptionId && orderId) {
      return fulfillPayPalSubscription({ orderId, subscriptionId });
    }
    return { ok: true as const, skipped: true as const };
  }

  if (type === "PAYMENT.SALE.COMPLETED") {
    const subscriptionId = String(
      resource.billing_agreement_id ?? resource.subscription_id ?? "",
    );
    const saleId = String(resource.id ?? "");
    if (subscriptionId) {
      return renewLicenseFromPayPalSale({ subscriptionId, saleId });
    }
    return { ok: true as const, skipped: true as const };
  }

  if (type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") {
    const subscriptionId = String(resource.id ?? "");
    if (subscriptionId) return suspendLicenseFromPayPalFailure(subscriptionId);
  }

  if (
    type === "BILLING.SUBSCRIPTION.CANCELLED" ||
    type === "BILLING.SUBSCRIPTION.EXPIRED"
  ) {
    const subscriptionId = String(resource.id ?? "");
    if (subscriptionId) return handlePayPalSubscriptionCancelled(subscriptionId);
  }

  return { ok: true as const, ignored: type };
}
