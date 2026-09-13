import Link from "next/link";

const items = [
  { href: "/admin/management/tools/mass-delete/live", label: "Live streams", desc: "Delete live channels in bulk", tone: "#38bdf8" },
  { href: "/admin/management/tools/mass-delete/movies", label: "Movies", desc: "Delete movie streams", tone: "#a78bfa" },
  { href: "/admin/management/tools/mass-delete/series", label: "TV series", desc: "Delete series entries", tone: "#f472b6" },
  { href: "/admin/management/tools/mass-delete/categories", label: "Categories", desc: "Delete, move, enable or disable by category", tone: "#fbbf24" },
  { href: "/admin/management/tools/mass-delete/bouquets", label: "Bouquets", desc: "Remove bouquets and unlink lines", tone: "#34d399" },
  { href: "/admin/management/tools/mass-delete/lines", label: "Lines", desc: "Delete subscriber lines (use Select all on that page)", tone: "#fb7185" },
  { href: "/admin/management/tools/mass-delete/users", label: "Users", desc: "Delete resellers (admins are protected)", tone: "#94a3b8" },
];

export default function MassDeleteHubPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Mass delete</h1>
          <p className="text-sm mt-1 max-w-2xl" style={{ color: "var(--muted)" }}>
            Pick a catalog, use Select all on the page, then delete in batches. Categories and bouquets
            have their own tools so you do not wipe the wrong tree.
          </p>
        </div>
        <Link href="/admin/management/tools" className="text-sm" style={{ color: "var(--accent)" }}>
          ← Tools
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl border p-5 block hover:opacity-95 transition-opacity"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-card)",
              boxShadow: `inset 3px 0 0 ${item.tone}`,
            }}
          >
            <div className="font-semibold">{item.label}</div>
            <div className="text-sm mt-2" style={{ color: "var(--muted)" }}>
              {item.desc}
            </div>
            <div className="text-xs mt-3" style={{ color: item.tone }}>
              Open →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
