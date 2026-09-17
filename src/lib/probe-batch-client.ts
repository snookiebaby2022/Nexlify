/** Client helper for /api/admin/streams/probe-batch — chunks + limited concurrency to avoid gateway HTML timeouts. */

export type ProbeBatchRow = {
  lastProbeOk?: boolean;
  lastProbeError?: string | null;
  error?: string;
  probe?: { status?: string; message?: string; latencyMs?: number };
};

const DEFAULT_CHUNK = 10;
/** Parallel chunk requests — keep low so Cloudflare/nginx do not HTML-504 the batch. */
const DEFAULT_CONCURRENCY = 2;

function htmlOrNonJsonError(status: number, body: string): Error {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("<!") || trimmed.toLowerCase().startsWith("<html")) {
    return new Error(
      status >= 500
        ? `Probe timed out on the server (HTTP ${status}). Probing fewer streams at a time — retry.`
        : `Server returned a web page instead of probe results (HTTP ${status}). Try again or probe fewer streams.`,
    );
  }
  return new Error(`Probe failed (HTTP ${status || "?"}): invalid response`);
}

export async function parseProbeBatchResponse(res: Response): Promise<{
  results: Record<string, ProbeBatchRow>;
  fast?: boolean;
  error?: string;
}> {
  const text = await res.text();
  let data: { results?: Record<string, ProbeBatchRow>; fast?: boolean; error?: string };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw htmlOrNonJsonError(res.status, text);
  }
  if (!res.ok || !data.results) {
    throw new Error(data.error || `Probe failed (HTTP ${res.status})`);
  }
  return { results: data.results, fast: data.fast, error: data.error };
}

function chunkIds(ids: string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  return chunks;
}

async function fetchProbeChunk(
  chunk: string[],
  fast: boolean,
  signal?: AbortSignal,
): Promise<Record<string, ProbeBatchRow>> {
  const res = await fetch("/api/admin/streams/probe-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ streamIds: chunk, fast }),
    signal,
  });
  const data = await parseProbeBatchResponse(res);
  return data.results;
}

/**
 * Probe many streams via the admin batch API.
 * Chunks stay small (gateway-safe); chunks themselves run with limited concurrency.
 */
export async function probeStreamsBatchClient(
  streamIds: string[],
  opts?: {
    fast?: boolean;
    chunkSize?: number;
    /** Max parallel chunk requests (default 2). */
    concurrency?: number;
    signal?: AbortSignal;
  },
): Promise<Record<string, ProbeBatchRow>> {
  const ids = [...new Set(streamIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) return {};

  const chunkSize = Math.max(1, Math.min(opts?.chunkSize ?? DEFAULT_CHUNK, 50));
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? DEFAULT_CONCURRENCY, 4));
  const fast = opts?.fast === true;
  const chunks = chunkIds(ids, chunkSize);
  const merged: Record<string, ProbeBatchRow> = {};

  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      if (opts?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const index = next++;
      const chunk = chunks[index]!;
      const results = await fetchProbeChunk(chunk, fast, opts?.signal);
      Object.assign(merged, results);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, chunks.length) }, () => worker());
  await Promise.all(workers);
  return merged;
}
