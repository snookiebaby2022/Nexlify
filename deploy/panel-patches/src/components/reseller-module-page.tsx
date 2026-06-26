import Link from "next/link";
import { getResellerModuleBySlug, resellerModulesByCategory, type ResellerModuleDef } from "@/lib/xui-reseller-modules";

export function ResellerModulePage({ slug }: { slug: string }) {
  const mod = getResellerModuleBySlug(slug);
  if (!mod) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Unknown module</h1>
        <Link href="/reseller/modules" style={{ color: "var(--accent)" }}>← All modules</Link>
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
        {mod.description ?? "Reseller module registered. Full UI coming soon."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/reseller/modules" className="text-sm" style={{ color: "var(--accent)" }}>← Reseller modules</Link>
        <Link href="/reseller/dashboard" className="text-sm" style={{ color: "var(--muted)" }}>Dashboard</Link>
      </div>
      <Related mod={mod} />
    </div>
  );
}

function Related({ mod }: { mod: ResellerModuleDef }) {
  const related = resellerModulesByCategory()
    .find(([c]) => c === mod.category)?.[1]
    .filter((m) => m.slug !== mod.slug)
    .slice(0, 6);
  if (!related?.length) return null;
  return (
    <ul className="text-sm space-y-1">
      {related.map((m) => (
        <li key={m.slug}>
          <Link href={`/reseller/${m.slug}`} style={{ color: "var(--accent)" }}>{m.title}</Link>
        </li>
      ))}
    </ul>
  );
}
