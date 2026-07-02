import type { UpdateEntry } from "@/lib/updates";

export function UpdatesList({ releases }: { releases: UpdateEntry[] }) {
  return (
    <div className="space-y-6">
      {releases.map((r) => (
        <article
          key={r.version}
          className="glass rounded-2xl border border-white/10 p-6 md:p-8"
        >
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="font-display text-lg font-semibold text-white">v{r.version}</h3>
            <time className="text-xs text-slate-500">{r.date}</time>
          </div>
          {r.description ? (
            <p className="mt-2 text-sm text-slate-300">{r.description}</p>
          ) : null}
          <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
            {r.changes.map((c) => (
              <li key={c} className="flex gap-2">
                <span className="text-violet-400 shrink-0">•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
