import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole } from "@prisma/client";
import {
  createBillingIntegration,
  getBillingIntegrations,
  deleteBillingIntegration,
  createInvoice,
  getInvoices,
  markInvoicePaid,
} from "@/lib/billing-integration";

export async function GET() {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [integrations, invoices] = await Promise.all([
    getBillingIntegrations(),
    getInvoices(),
  ]);

  return NextResponse.json({ integrations, invoices });
}

export async function POST(req: Request) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, provider, apiKey, integrationId, lineId, amount, invoiceId } = await req.json();

  if (action === "create_integration") {
    const integration = await createBillingIntegration(provider, apiKey);
    return NextResponse.json(integration);
  }

  if (action === "delete_integration") {
    await deleteBillingIntegration(integrationId);
    return NextResponse.json({ ok: true });
  }

  if (action === "create_invoice") {
    const invoice = await createInvoice(lineId, amount);
    return NextResponse.json(invoice);
  }

  if (action === "mark_paid") {
    await markInvoicePaid(invoiceId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
