import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const BILLING_PREFIX = "billing:";

export type BillingIntegration = {
  id: string;
  provider: "stripe" | "paypal" | "billing";
  apiKey: string;
  isActive: boolean;
};

export type Invoice = {
  id: string;
  lineId: string;
  amount: number;
  status: "pending" | "paid" | "failed";
  createdAt: number;
  paidAt?: number;
};

export async function createBillingIntegration(
  provider: BillingIntegration["provider"],
  apiKey: string
): Promise<BillingIntegration> {
  const integration: BillingIntegration = {
    id: `billing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    provider,
    apiKey,
    isActive: true,
  };

  const integrations = await getBillingIntegrations();
  integrations.push(integration);
  await cacheSet(`${BILLING_PREFIX}integrations`, integrations, 86400);
  return integration;
}

export async function getBillingIntegrations(): Promise<BillingIntegration[]> {
  return (await cacheGet<BillingIntegration[]>(`${BILLING_PREFIX}integrations`)) ?? [];
}

export async function deleteBillingIntegration(integrationId: string): Promise<boolean> {
  const integrations = await getBillingIntegrations();
  const filtered = integrations.filter((i) => i.id !== integrationId);
  await cacheSet(`${BILLING_PREFIX}integrations`, filtered, 86400);
  return true;
}

export async function createInvoice(lineId: string, amount: number): Promise<Invoice> {
  const invoice: Invoice = {
    id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    lineId,
    amount,
    status: "pending",
    createdAt: Date.now(),
  };

  const invoices = await getInvoices();
  invoices.push(invoice);
  await cacheSet(`${BILLING_PREFIX}invoices`, invoices, 86400);
  return invoice;
}

export async function getInvoices(): Promise<Invoice[]> {
  return (await cacheGet<Invoice[]>(`${BILLING_PREFIX}invoices`)) ?? [];
}

export async function markInvoicePaid(invoiceId: string): Promise<boolean> {
  const invoices = await getInvoices();
  const idx = invoices.findIndex((i) => i.id === invoiceId);
  if (idx < 0) return false;
  invoices[idx].status = "paid";
  invoices[idx].paidAt = Date.now();
  await cacheSet(`${BILLING_PREFIX}invoices`, invoices, 86400);
  return true;
}
