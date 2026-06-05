import Link from "next/link";

const items = [
  { href: "/admin/management/tools/mass-delete/live", label: "Live streams", desc: "Delete live channels (50 per page)" },
  { href: "/admin/management/tools/mass-delete/movies", label: "Movies", desc: "Delete movie streams" },
  { href: "/admin/management/tools/mass-delete/series", label: "TV series", desc: "Delete series entries" },
  { href: "/admin/management/tools/mass-delete/lines", label: "Lines", desc: "Delete subscriber lines" },
  { href: "/admin/management/tools/mass-delete/users", label: "Users", desc: "Delete resellers (not admins)" },
];

export default function MassDeleteHubPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <h1 className="text-2xl font-semibold flex-1">Mass delete</h1>
        <Link href="/admin/management/tools" className="text-sm" style={{ color: "var(--accent)" }}>← Tools</Link>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-lg border p-4 block hover:opacity-90" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="font-medium">{item.label}</div>
            <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>{item.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
