import { PanelMigrationSlide } from "@/components/demo/panel-slide-views";

type BlogMigrationVisualProps = {
  caption?: string;
};

export function BlogMigrationVisual({
  caption = "Panel migration wizard — preview import before live cutover (demo UI mockup).",
}: BlogMigrationVisualProps) {
  return (
    <figure className="my-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0818] p-4">
      <div className="mx-auto max-w-md">
        <PanelMigrationSlide />
      </div>
      <figcaption className="mt-3 text-center text-xs text-[var(--muted)]">{caption}</figcaption>
    </figure>
  );
}
