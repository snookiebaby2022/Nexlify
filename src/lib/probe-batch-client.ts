/** Client helper for /api/admin/streams/probe-batch — chunks to avoid gateway HTML timeouts. */

export type ProbeBatchRow = {
  lastProbeOk?: boolean;
  lastProbeError?: string | null;
  error?: string;
  probe?: { status?: string; message?: string; latencyMs?: number };
};

const DEFAULT_CHUNK = 10;

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

/** Full/fast probe in small sequential chunks so nginx/Cloudflare do not return HTML 504 pages. */
export async function probeStreamsBatchClient(
  streamIds: string[],
  opts?: { fast?: boolean; chunkSize?: number; signal?: AbortSignal },
): Promise<Record<string, ProbeBatchRow>> {
  const ids = [...new Set(streamIds.map((id) => String(id).trim()).filter(Boolean))];
  const chunkSize = Math.max(1, Math.min(opts?.chunkSize ?? DEFAULT_CHUNK, 50));
  const fast = opts?.fast === true;
  const merged: Record<string, ProbeBatchRow> = {};

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const res = await fetch("/api/admin/streams/probe-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamIds: chunk, fast }),
      signal: opts?.signal,
    });
    const data = await parseProbeBatchResponse(res);
    Object.assign(merged, data.results);
  }

  return merged;
}
