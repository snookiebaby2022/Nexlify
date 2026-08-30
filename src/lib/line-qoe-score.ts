export function lineQoeFromWatchedAt(watchedAt?: string | Date | null): {
  score: number;
  label: string;
} | null {
  if (!watchedAt) return null;
  const t = watchedAt instanceof Date ? watchedAt.getTime() : Date.parse(watchedAt);
  if (!Number.isFinite(t)) return null;
  const ageSec = Math.max(0, (Date.now() - t) / 1000);
  if (ageSec <= 45) return { score: 96, label: "Excellent" };
  if (ageSec <= 3 * 60) return { score: 88, label: "Good" };
  if (ageSec <= 15 * 60) return { score: 74, label: "Fair" };
  if (ageSec <= 60 * 60) return { score: 58, label: "Idle" };
  return { score: 40, label: "Stale" };
}
