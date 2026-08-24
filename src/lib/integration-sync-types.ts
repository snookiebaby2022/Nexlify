export type IntegrationSyncProgress = {
  jobId: string;
  status: "running" | "done" | "error";
  phase: string;
  message: string;
  current: number;
  total: number;
  imported: number;
  skipped: number;
  episodes?: number;
  titleCurrent?: number;
  titleTotal?: number;
  libraryName?: string;
  warnings?: string[];
  steps: { at: string; text: string }[];
  error?: string;
  updatedAt: string;
};
