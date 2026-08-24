export type FetchRetryOptions = RequestInit & {
  /** Total attempts including the first (default 3). */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Retry on these HTTP status codes (default 429, 502, 503, 504). */
  retryStatuses?: number[];
};

const DEFAULT_RETRY_STATUSES = new Set([429, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number, retryStatuses: Set<number>): boolean {
  return retryStatuses.has(status) || status >= 500;
}

/**
 * fetch with exponential backoff for transient network / upstream failures.
 */
export async function fetchWithRetry(
  url: string,
  options: FetchRetryOptions = {}
): Promise<Response> {
  const {
    retries = 3,
    baseDelayMs = 400,
    maxDelayMs = 8000,
    retryStatuses = [...DEFAULT_RETRY_STATUSES],
    ...init
  } = options;
  const statusSet = new Set(retryStatuses);
  const attempts = Math.max(1, retries);
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || !shouldRetryStatus(res.status, statusSet) || attempt === attempts - 1) {
        return res;
      }
    } catch (err) {
      lastError = err;
      if (attempt === attempts - 1) throw err;
    }
    const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
    await sleep(delay);
  }

  throw lastError instanceof Error ? lastError : new Error("fetchWithRetry failed");
}
