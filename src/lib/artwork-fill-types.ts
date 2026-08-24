export type ArtworkFillMode = "fast" | "full";

export type ArtworkFillType = "LIVE" | "MOVIE" | "SERIES" | "ALL";

export type ArtworkFillProgress = {
  jobId: string;
  status: "idle" | "running" | "done" | "error";
  mode: ArtworkFillMode;
  types: ArtworkFillType[];
  phase: string;
  message: string;
  current: number;
  total: number;
  updated: number;
  fromProvider: number;
  fromPlex: number;
  fromSeriesCover: number;
  fromTmdb: number;
  fromLiveLogo: number;
  remaining: number;
  tmdbConfigured: boolean;
  steps: { at: string; text: string }[];
  error?: string;
  updatedAt: string;
  cancelRequested?: boolean;
};

export type ArtworkFillReporter = {
  jobId: string;
  step: (phase: string, message: string) => Promise<void>;
  note: (
    message: string,
    patch?: Partial<
      Pick<
        ArtworkFillProgress,
        | "current"
        | "total"
        | "updated"
        | "fromProvider"
        | "fromPlex"
        | "fromSeriesCover"
        | "fromTmdb"
        | "fromLiveLogo"
        | "remaining"
        | "tmdbConfigured"
      >
    >
  ) => Promise<void>;
  counts: (
    patch: Partial<
      Pick<
        ArtworkFillProgress,
        | "current"
        | "total"
        | "updated"
        | "fromProvider"
        | "fromPlex"
        | "fromSeriesCover"
        | "fromTmdb"
        | "fromLiveLogo"
        | "remaining"
        | "tmdbConfigured"
      >
    >
  ) => Promise<void>;
  done: (message: string) => Promise<void>;
  fail: (error: string) => Promise<void>;
  isCancelled: () => boolean;
  snapshot: () => ArtworkFillProgress;
};

export function artworkFillPercent(progress: ArtworkFillProgress | null): number {
  if (!progress) return 0;
  if (progress.status === "done") return 100;
  if (progress.status === "error") {
    return progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  }
  if (progress.total > 0) {
    return Math.min(99, Math.round((progress.current / progress.total) * 100));
  }
  if (progress.status === "running") return 8;
  return 0;
}
