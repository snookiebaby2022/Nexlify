import Link from "next/link";

export default function AdminShopPage() {
  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-semibold">Customer shop</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Enable a package with “List on public /shop” and a price. Customers open the storefront, pay/create,
        and get a line with M3U + web player.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/shop" className="rounded px-3 py-2" style={{ background: "var(--accent)", color: "#fff" }}>
          Open public shop
        </Link>
        <Link href="/admin/management/packages" className="rounded px-3 py-2 border" style={{ borderColor: "var(--border)" }}>
          Edit packages
        </Link>
        <Link href="/admin/settings/api" className="rounded px-3 py-2 border" style={{ borderColor: "var(--border)" }}>
          Admin API
        </Link>
      </div>
    </div>
  );
}
