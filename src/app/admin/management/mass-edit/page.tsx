import Link from "next/link";

const items = [
  { href: "/admin/management/mass-edit/users", label: "Users & resellers", desc: "Group, credits, max lines, enable/disable, delete" },
  { href: "/admin/management/mass-edit/lines", label: "Lines", desc: "Status, restrictions, bouquets, delete" },
  { href: "/admin/resellers/bouquets", label: "Bouquet access", desc: "Bulk assign bouquets to resellers" },
  { href: "/admin/management/mass-edit/streams", label: "Live streams", desc: "Category, bouquet, server, speed, on-demand, hosted URL, adult" },
  { href: "/admin/management/mass-edit/movies", label: "Movies", desc: "Category, bouquet, container, speed, hosted URL, adult" },
  { href: "/admin/management/mass-edit/series", label: "TV series", desc: "Category, bouquet, container, hosted URL, adult" },
  { href: "/admin/management/mass-edit/episodes", label: "Episodes", desc: "Category, series name, bouquet, container, hosted URL" },
];

export default function MassEditHubPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Mass edit</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Bulk operations on users, lines, bouquet access, live streams, movies, and TV series.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-lg border p-4 block hover:opacity-90 transition-opacity"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <div className="font-medium">{item.label}</div>
            <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
              {item.desc}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
