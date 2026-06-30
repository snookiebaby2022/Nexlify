import { JsonLdScript } from "@/components/JsonLdScript";
import { buildLpJsonLdGraph, formatFreshnessLabel, NEXLIFY_AUTHOR } from "@/lib/geo";
import { getLpGeoContent } from "@/lib/lp-geo-content";

type LpPageJsonLdProps = {
  path: string;
  name: string;
  description: string;
  about: string;
  definition?: string;
};

export function LpPageJsonLd({ path, name, description, about, definition }: LpPageJsonLdProps) {
  const geo = getLpGeoContent(path);
  if (!geo) return null;

  const graph = buildLpJsonLdGraph({
    path,
    name,
    description,
    definition: definition ?? geo.definition,
    about,
    datePublished: geo.datePublished,
    dateModified: geo.dateModified,
    faq: geo.faq,
    includeProduct: true,
  });

  return <JsonLdScript data={graph} />;
}

type LpAuthorBylineProps = {
  path: string;
};

export function LpAuthorByline({ path }: LpAuthorBylineProps) {
  const geo = getLpGeoContent(path);
  if (!geo) return null;

  return (
    <footer className="border-t border-white/10 bg-[#05040a] py-6">
      <div className="mx-auto max-w-3xl px-4 text-center text-sm text-[var(--muted)]">
        <p>
          By{" "}
          <a
            href={NEXLIFY_AUTHOR.url}
            rel="author"
            className="text-violet-300 hover:text-white transition-colors"
          >
            {NEXLIFY_AUTHOR.name}
          </a>
          {" · "}
          <time dateTime={geo.dateModified}>Updated {formatFreshnessLabel(geo.dateModified)}</time>
          {" · "}
          <time dateTime={geo.datePublished}>First published {formatFreshnessLabel(geo.datePublished)}</time>
        </p>
      </div>
    </footer>
  );
}

type LpFaqSectionProps = {
  path: string;
};

export function LpFaqSection({ path }: LpFaqSectionProps) {
  const geo = getLpGeoContent(path);
  if (!geo?.faq.length) return null;

  return (
    <section className="border-y border-white/10 py-16 md:py-20" aria-labelledby="lp-faq-heading">
      <div className="mx-auto max-w-3xl px-4">
        <h2 id="lp-faq-heading" className="font-display text-center text-2xl font-bold text-white md:text-3xl">
          Frequently asked questions
        </h2>
        <div className="mt-10 space-y-3">
          {geo.faq.map((item) => (
            <details
              key={item.question}
              className="glass group rounded-xl border border-white/10 open:border-violet-500/30"
            >
              <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-3">
                  {item.question}
                  <span className="shrink-0 text-violet-400 transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </span>
              </summary>
              <p className="border-t border-white/10 px-5 py-4 text-sm leading-relaxed text-[var(--muted)]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LpDefinitionLead({ path, fallback }: { path: string; fallback?: string }) {
  const geo = getLpGeoContent(path);
  const text = geo?.definition ?? fallback;
  if (!text) return null;

  return (
    <p className="mx-auto mt-4 max-w-2xl text-base font-medium leading-relaxed text-violet-100/90 md:text-lg">
      {text}
    </p>
  );
}
