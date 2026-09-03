/** In-process wake-ups for Live Connections SSE. Heartbeats do not notify — only add/kick. */

type Listener = () => void;

const listeners = new Set<Listener>();
let generation = 0;

export function liveConnectionsGeneration(): number {
  return generation;
}

export function notifyLiveConnectionsChanged(): void {
  generation += 1;
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
      unsub();
      signal?.removeEventListener("abort", finish);
      resolve(generation);
    };
    const timer = setTimeout(finish, Math.max(1_000, timeoutMs));
    const unsub = subscribeLiveConnections(finish);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
