import Link from "next/link";
import { getModuleBySlug, modulesByCategory, type AdminModuleDef } from "@/lib/xui-admin-modules";

export function AdminModulePage({ slug }: { slug: string }) {
  const mod = getModuleBySlug(slug);
  if (!mod) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Unknown module</h1>
        <Link href="/admin/modules" style={{ color: "var(--accent)" }}>← All modules</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap gap-3 items-center">
        <h1 className="text-2xl font-semibold flex-1">{mod.title}</h1>
        <span className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {mod.slug}
        </span>
      </div>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {mod.description ?? "This XUI-style module is registered in Nexlify. Full parity is planned."}
      </p>
      <p className="text-sm">
        Category: <strong>{mod.category}</strong>
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/modules" className="text-sm" style={{ color: "var(--accent)" }}>
          ← All admin modules
        </Link>
        <Link href="/admin/dashboard" className="text-sm" style={{ color: "var(--muted)" }}>
          Dashboard
        </Link>
      </div>
      <RelatedModules current={mod} />
    </div>
  );
}

function RelatedModules({ current }: { current: AdminModuleDef }) {
  const related = modulesByCategory()
    .find(([cat]) => cat === current.category)?.[1]
    .filter((m) => m.slug !== current.slug)
    .slice(0, 8);
  if (!related?.length) return null;
  return (
    <div>
      <h2 className="text-sm font-medium mb-2">Related in {current.category}</h2>
      <ul className="text-sm space-y-1">
        {related.map((m) => (
          <li key={m.slug}>
            <Link href={`/admin/${m.slug}`} style={{ color: "var(--accent)" }}>
              {m.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
