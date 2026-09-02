import { extendLicense } from "@/lib/admin-license";
import { issueLicenseForOrder } from "@/lib/licensing";
import { sendMarketingEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { syncLicenseToPanel } from "@/lib/panel-sync";
import { getAppUrl } from "@/lib/app-url";
import type Stripe from "stripe";

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
      recipients.map((to) => sendMarketingEmail({ to, subject: `[Nexlify Billing] ${subject}`, text }))
    );
  } catch (e) {
    console.error("[stripe-billing] admin notify failed", e);
  }
}

export async function attachSubscriptionToLicense(opts: {
  orderId: string;
  subscriptionId: string;
  customerId?: string | null;
  status?: string | null;
}) {
  const license = await prisma.license.findFirst({
    where: { orderId: opts.orderId },
  });
  if (!license) return null;

  return prisma.license.update({
    where: { id: license.id },
    data: {
      stripeSubscriptionId: opts.subscriptionId,
      stripeCustomerId: opts.customerId ?? license.stripeCustomerId,
      stripeSubscriptionStatus: opts.status ?? "active",
      status: license.status === "UNUSED" || license.status === "EXPIRED" ? license.status : "ACTIVE",
      notes:
        (license.notes ? `${license.notes}\n` : "") +
        `[stripe] subscription ${opts.subscriptionId} linked ${new Date().toISOString()}`,
    },
  });
}

export async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId?.trim();
  if (!orderId) return { ok: false as const, error: "missing_order" };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { license: true, plan: true },
  });
  if (!order) return { ok: false as const, error: "order_not_found" };

  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  if (order.status !== "COMPLETED") {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "COMPLETED",
        stripePaymentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? order.stripePaymentId,
        stripeSubscriptionId: subId ?? order.stripeSubscriptionId,
        billingMode: session.mode === "subscription" ? "subscription" : "payment",
      },
    });
  } else if (subId && !order.stripeSubscriptionId) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        stripeSubscriptionId: subId,
        billingMode: "subscription",
      },
    });
  }

  let license = order.license ?? (await issueLicenseForOrder(orderId));
  if (license && subId) {
    license = await attachSubscriptionToLicense({
      orderId,
      subscriptionId: subId,
      customerId,
      status: "active",
    });
  }

  if (license) {
    await syncLicenseToPanel(license.id, "ACTIVATE", { licenseKey: license.key }).catch(() => {});
  }

  return { ok: true as const, licenseId: license?.id ?? null };
}

export async function renewLicenseFromInvoice(invoice: Stripe.Invoice) {
  const subId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id ?? null;
  if (!subId) return { ok: false as const, error: "no_subscription" };

  // First invoice is handled by checkout.session.completed — avoid double-extend.
  if (invoice.billing_reason === "subscription_create") {
    return { ok: true as const, skipped: true as const };
  }

  const license = await prisma.license.findFirst({
    where: { stripeSubscriptionId: subId },
    include: { plan: true, user: { select: { email: true } } },
  });
  if (!license) return { ok: false as const, error: "license_not_found" };

  const days = license.plan.durationDays || 30;
  const updated = await extendLicense(license.id, days);
  if (!updated) return { ok: false as const, error: "extend_failed" };

  await prisma.license.update({
    where: { id: license.id },
    data: {
      status: "ACTIVE",
      stripeSubscriptionStatus: "active",
      stripeCustomerId:
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id ?? license.stripeCustomerId,
    },
  });

  await syncLicenseToPanel(license.id, "REPLACE", { licenseKey: updated.key }).catch(() => {});

  await notifyAdminsBilling(
    `Renewed ${license.user.email}`,
    `Subscription ${subId} paid. License extended by ${days} days.\nCustomer: ${license.user.email}\nInvoice: ${invoice.id}\nAdmin: ${getAppUrl()}/admin?tab=billing`
  );

  return { ok: true as const, licenseId: license.id };
}

export async function suspendLicenseFromInvoice(invoice: Stripe.Invoice) {
  const subId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id ?? null;
  if (!subId) return { ok: false as const, error: "no_subscription" };

  const license = await prisma.license.findFirst({
    where: { stripeSubscriptionId: subId },
    include: { user: { select: { email: true } } },
  });
  if (!license) return { ok: false as const, error: "license_not_found" };

  await prisma.license.update({
    where: { id: license.id },
    data: {
      status: "SUSPENDED",
      stripeSubscriptionStatus: "past_due",
      notes:
        (license.notes ? `${license.notes}\n` : "") +
        `[stripe] payment_failed ${invoice.id} ${new Date().toISOString()}`,
    },
  });

  await syncLicenseToPanel(license.id, "SUSPEND").catch(() => {});

  await notifyAdminsBilling(
    `Payment failed — ${license.user.email}`,
    `Subscription ${subId} payment failed. License SUSPENDED on marketing + panel push attempted.\nCustomer: ${license.user.email}\nInvoice: ${invoice.id}\nOpen billing: ${getAppUrl()}/admin?tab=billing`
  );

  return { ok: true as const, licenseId: license.id };
}

export async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const license = await prisma.license.findFirst({
    where: { stripeSubscriptionId: sub.id },
  });
  if (!license) return { ok: false as const, error: "license_not_found" };

  const status = sub.status;
  await prisma.license.update({
    where: { id: license.id },
    data: {
      stripeSubscriptionStatus: status,
      stripeCustomerId:
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? license.stripeCustomerId,
    },
  });

  if (status === "active" || status === "trialing") {
    if (license.status === "SUSPENDED") {
      await prisma.license.update({
        where: { id: license.id },
        data: { status: "ACTIVE" },
      });
      await syncLicenseToPanel(license.id, "UNSUSPEND").catch(() => {});
    }
  } else if (status === "past_due" || status === "unpaid") {
    await prisma.license.update({
      where: { id: license.id },
      data: { status: "SUSPENDED" },
    });
    await syncLicenseToPanel(license.id, "SUSPEND").catch(() => {});
  } else if (status === "canceled" || status === "incomplete_expired") {
    await prisma.license.update({
      where: { id: license.id },
      data: { status: "EXPIRED", stripeSubscriptionStatus: status },
    });
    await syncLicenseToPanel(license.id, "REVOKE").catch(() => {});
  }

  return { ok: true as const };
}

export async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const license = await prisma.license.findFirst({
    where: { stripeSubscriptionId: sub.id },
    include: { user: { select: { email: true } } },
  });
  if (!license) return { ok: false as const, error: "license_not_found" };

  await prisma.license.update({
    where: { id: license.id },
    data: {
      status: "EXPIRED",
      stripeSubscriptionStatus: "canceled",
      notes:
        (license.notes ? `${license.notes}\n` : "") +
        `[stripe] subscription canceled ${new Date().toISOString()}`,
    },
  });
  await syncLicenseToPanel(license.id, "REVOKE").catch(() => {});

  await notifyAdminsBilling(
    `Subscription canceled — ${license.user.email}`,
    `Subscription ${sub.id} canceled. License marked EXPIRED.\n${getAppUrl()}/admin?tab=billing`
  );

  return { ok: true as const };
}

/** Mark ACTIVE/UNUSED licenses past expiresAt as EXPIRED (and push revoke when subscribed). */
export async function expirePastDueLicenses() {
  const due = await prisma.license.findMany({
    where: {
      status: { in: ["ACTIVE", "UNUSED"] },
      expiresAt: { lt: new Date() },
    },
    select: { id: true, stripeSubscriptionId: true, notes: true },
  });

  let marked = 0;
  const stamp = `[auto] Marked EXPIRED ${new Date().toISOString().slice(0, 10)} — past expiresAt`;
  for (const row of due) {
    await prisma.license.update({
      where: { id: row.id },
      data: {
        status: "EXPIRED",
        notes: row.notes ? `${row.notes}\n${stamp}` : stamp,
      },
    });
    if (row.stripeSubscriptionId) {
      await syncLicenseToPanel(row.id, "REVOKE").catch(() => {});
    }
    marked += 1;
  }
  return { marked };
}
