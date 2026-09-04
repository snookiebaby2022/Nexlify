import { cacheGet, cacheSet } from "./cache";

/** In-process + Redis wake-ups for Live Connections SSE. */

type Listener = () => void;

const listeners = new Set<Listener>();
let generation = 0;
export const LIVE_GEN_KEY = "conn:live:gen";

export function liveConnectionsGeneration(): number {
  return generation;
}

export function notifyLiveConnectionsChanged(): void {
  generation += 1;
  void cacheSet(LIVE_GEN_KEY, generation, 86_400).catch(() => {});
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      /* ignore listener errors */
    }
  }
}

export function subscribeLiveConnections(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function waitForLiveConnectionsChange(
  since: number,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<number> {
  if (generation !== since) return Promise.resolve(generation);
  if (signal?.aborted) return Promise.resolve(generation);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      unsub();
      signal?.removeEventListener("abort", finish);
      resolve(generation);
    };
    const timer = setTimeout(finish, Math.max(1_000, timeoutMs));
    const poll = setInterval(() => {
      void cacheGet<number>(LIVE_GEN_KEY).then((remote) => {
        if (typeof remote === "number" && remote !== since) {
          generation = Math.max(generation, remote);
          finish();
        }
      });
    }, 400);
    const unsub = subscribeLiveConnections(finish);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
