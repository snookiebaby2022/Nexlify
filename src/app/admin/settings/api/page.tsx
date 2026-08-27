"use client";

import Link from "next/link";
import { XUI_API_ACTIONS } from "@/lib/xui-api-catalog";

const GROUPS = [...new Set(XUI_API_ACTIONS.map((a) => a.group))];

export default function AdminApiDocsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Admin API & WHMCS</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          XUI One-compatible actions for billing scripts. Optional HMAC header{" "}
          <code className="text-xs">x-nexlify-signature</code> when a HMAC secret is set.
        </p>
      </div>

      <section className="rounded-lg border p-4 space-y-2 text-sm" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-semibold">Call format</h2>
        <pre className="text-xs overflow-x-auto rounded border p-3" style={{ borderColor: "var(--border)" }}>
{`GET /api/v1?api_key=KEY&action=create_line&username=demo&password=secret&days=30&max_connections=1&package_id=PACKAGE_ID
GET /api/v1?api_key=KEY&action=get_lines
GET /api/v1?api_key=KEY&action=add_credits&username=reseller1&credits=10`}
        </pre>
        <p style={{ color: "var(--muted)" }}>
          Set the API key on an admin (Users → edit). Access code can be passed as{" "}
          <code className="text-xs">access_code</code> when the admin uses one.
        </p>
      </section>

      <section className="rounded-lg border p-4 space-y-4 text-sm" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-semibold">Actions ({XUI_API_ACTIONS.length})</h2>
        {GROUPS.map((g) => (
          <div key={g}>
            <h3 className="font-medium mb-1">{g}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: "var(--muted)" }}>
                    <th className="text-left py-1 pr-3">action</th>
                    <th className="text-left py-1">params</th>
                  </tr>
                </thead>
                <tbody>
                  {XUI_API_ACTIONS.filter((a) => a.group === g).map((a) => (
                    <tr key={a.action} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1 pr-3 font-mono">{a.action}</td>
                      <td className="py-1" style={{ color: "var(--muted)" }}>
                        {a.params || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border p-4 space-y-2 text-sm" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-semibold">WHMCS webhook</h2>
        <p style={{ color: "var(--muted)" }}>
          Set <code className="text-xs">BILLING_WEBHOOK_SECRET</code> in the panel <code className="text-xs">.env</code>.
        </p>
        <pre className="text-xs overflow-x-auto rounded border p-3" style={{ borderColor: "var(--border)" }}>
{`POST /api/billing/webhook
Header: X-Billing-Secret: YOUR_SECRET
{"action":"create","username":"u1","password":"p1","days":30,"max_connections":1,"bouquet_ids":["..."],"service_id":"123"}`}
        </pre>
        <p style={{ color: "var(--muted)" }}>
          Actions: create, suspend, unsuspend, terminate, renew, add_credits.
        </p>
        <Link href="/api/admin/billing/whmcs-zip" className="inline-block text-sm" style={{ color: "var(--accent)" }}>
          Download WHMCS module ZIP
        </Link>
      </section>

      <p className="text-sm">
        <Link href="/admin/settings/billing" style={{ color: "var(--accent)" }}>
          Billing & rewards
        </Link>
        {" · "}
        <Link href="/shop" style={{ color: "var(--accent)" }}>
          Public shop
        </Link>
        {" · "}
        <Link href="/webplayer/multiview" style={{ color: "var(--accent)" }}>
          Multi-view player
        </Link>
      </p>
    </div>
  );
}
