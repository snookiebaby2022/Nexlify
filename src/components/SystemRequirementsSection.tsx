import Link from "next/link";

export function SystemRequirementsSection({
  compact = false,
  showCompareLink = true,
}: {
  compact?: boolean;
  showCompareLink?: boolean;
}) {
  const items = [
    { title: "Nginx 1.29.0", desc: "HTTP/2, HTTP/3, QUIC edge delivery" },
    { title: "FFmpeg 8.0", desc: "Highly optimized CPU + CUDA builds" },
    { title: "NVIDIA NVENC", desc: "Optional GPU transcode ladder (4K HEVC)" },
    { title: "GeoIP modules", desc: "MaxMind + network control & geo LB" },
  ];

  if (compact) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-lg font-semibold text-white">Minimum requirements</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Ubuntu 22.04+ or Debian 12+. Panel: 4 GB RAM, 2 CPU, 20 GB SSD. Stream VPS: 8 GB+ for FFmpeg 8 transcode.
        </p>
        <ul className="mt-4 grid sm:grid-cols-2 gap-2 text-xs text-[var(--muted)]">
          {items.map((i) => (
            <li key={i.title} className="rounded-lg border border-white/10 px-3 py-2">
              <strong className="text-white">{i.title}</strong> — {i.desc}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="py-12">
      <h2 className="text-2xl font-bold text-white">System requirements</h2>
      <p className="mt-4 text-[var(--muted)] max-w-2xl">
        Panel: Ubuntu 22.04+ or Debian 12+, 4 GB RAM, 2 CPU cores, 20 GB SSD.
        Stream servers: 8 GB+ RAM recommended for FFmpeg 8 transcoding; NVIDIA GPU optional for NVENC.
      </p>
      <ul className="mt-6 grid sm:grid-cols-2 gap-3 text-sm text-[var(--muted)]">
        {items.map((i) => (
          <li key={i.title} className="rounded-lg border border-white/10 px-4 py-3">
            <strong className="text-white">{i.title}</strong> — {i.desc}
          </li>
        ))}
      </ul>
      {showCompareLink && (
        <p className="mt-6 text-sm">
          <Link href="/features" className="text-violet-400 hover:text-violet-300 underline">
            Compare all features →
          </Link>
        </p>
      )}
    </section>
  );
}
