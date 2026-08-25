"use client";

import Link from "next/link";

export default function AdminApiDocsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Admin API & WHMCS</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Same job as XUI One / 1-Stream: billing creates lines without logging into the panel.
        </p>
      </div>

      <section className="rounded-lg border p-4 space-y-2 text-sm" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-semibold">1. Panel API key</h2>
        <p style={{ color: "var(--muted)" }}>
          Set an API key on an admin user (Users → edit). Call{" "}
          <code className="text-xs">/api/v1?api_key=YOUR_KEY&amp;action=…</code>
        </p>
        <pre className="text-xs overflow-x-auto rounded border p-3" style={{ borderColor: "var(--border)" }}>
{`GET /api/v1?api_key=KEY&action=create_line&username=demo&password=secret&days=30&max_connections=1&bouquets=BOUQUET_ID
GET /api/v1?api_key=KEY&action=create_line&username=demo&password=secret&package_id=PACKAGE_ID
GET /api/v1?api_key=KEY&action=get_lines
GET /api/v1?api_key=KEY&action=add_credits&username=reseller1&credits=10
GET /api/v1?api_key=KEY&action=get_packages`}
        </pre>
        <p style={{ color: "var(--muted)" }}>
          Line actions: create_line, edit_line, disable_line, enable_line, delete_line, get_line, get_lines.
          Reseller: create_reseller, add_credits.
        </p>
      </section>

      <section className="rounded-lg border p-4 space-y-2 text-sm" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-semibold">2. WHMCS webhook</h2>
        <p style={{ color: "var(--muted)" }}>
          Set <code className="text-xs">BILLING_WEBHOOK_SECRET</code> in the panel <code className="text-xs">.env</code>.
          Download the module and upload it to WHMCS <code className="text-xs">modules/servers/nexlify/</code>.
        </p>
        <pre className="text-xs overflow-x-auto rounded border p-3" style={{ borderColor: "var(--border)" }}>
{`POST /api/billing/webhook
Header: X-Billing-Secret: YOUR_SECRET
{"action":"create","username":"u1","password":"p1","days":30,"max_connections":1,"bouquet_ids":["..."],"service_id":"123"}`}
        </pre>
        <p style={{ color: "var(--muted)" }}>
          Actions: create, suspend, unsuspend, terminate, renew, add_credits (reseller username + credits).
        </p>
        <Link href="/api/admin/billing/whmcs-zip" className="inline-block text-sm" style={{ color: "var(--accent)" }}>
          Download WHMCS module ZIP
        </Link>
      </section>

      <p className="text-sm">
        <Link href="/admin/settings/billing" style={{ color: "var(--accent)" }}>
          Billing & PayPal settings
        </Link>
        {" · "}
        <Link href="/shop" style={{ color: "var(--accent)" }}>
          Public shop
        </Link>
        {" · "}
        <Link href="/portal" style={{ color: "var(--accent)" }}>
          Subscriber portal
        </Link>
      </p>
    </div>
  );
}
