type InstallJob = {
  id: string;
  progress: number;
  step: string;
  done: boolean;
  error?: string;
  result?: Record<string, unknown>;
};

const jobs = new Map<string, InstallJob>();

const STEPS = [
  "Validating panel URL…",
  "Preparing agent token…",
  "Building install script…",
  "Configuring FFmpeg & PHP paths…",
  "Registering stream agent…",
  "Finalizing server record…",
];

function newId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function getInstallJob(id: string): InstallJob | undefined {
  return jobs.get(id);
}

export function createInstallJob(): string {
  const id = newId();
  jobs.set(id, { id, progress: 0, step: STEPS[0], done: false });
  return id;
}

export function completeInstallJob(id: string, result: Record<string, unknown>) {
  const job = jobs.get(id);
  if (!job) return;
  job.progress = 100;
  job.step = "Install ready";
  job.done = true;
  job.result = result;
}

export function failInstallJob(id: string, error: string) {
  const job = jobs.get(id);
  if (!job) return;
  job.error = error;
  job.done = true;
  job.step = "Failed";
}

export function advanceInstallJob(id: string) {
  const job = jobs.get(id);
  if (!job || job.done) return;
  const idx = Math.min(STEPS.length - 1, Math.floor((job.progress / 100) * STEPS.length));
  job.step = STEPS[idx] ?? STEPS[STEPS.length - 1];
}

export function tickInstallJob(id: string, progress: number) {
  const job = jobs.get(id);
  if (!job || job.done) return;
  job.progress = Math.min(99, progress);
  const idx = Math.min(STEPS.length - 1, Math.floor((job.progress / 100) * STEPS.length));
  job.step = STEPS[idx] ?? job.step;
}

export function runInstallJobSimulation(
  id: string,
  run: () => Promise<Record<string, unknown>>
) {
  let p = 5;
  const timer = setInterval(() => {
    tickInstallJob(id, p);
    p += 12;
    if (p >= 90) clearInterval(timer);
  }, 400);

  void run()
    .then((result) => {
      clearInterval(timer);
      completeInstallJob(id, result);
    })
    .catch((e: unknown) => {
      clearInterval(timer);
      failInstallJob(id, e instanceof Error ? e.message : "Install failed");
    });
}

/** Prune old jobs (keep map small). */
export function pruneInstallJobs() {
  if (jobs.size < 50) return;
  const keys = [...jobs.keys()].slice(0, jobs.size - 40);
  for (const k of keys) jobs.delete(k);
}
