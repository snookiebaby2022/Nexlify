/** In-memory concurrent viewer registry (single PM2 process). */

const STALE_MS = 45_000;
const MAX_VIEWER_ID_LEN = 64;
const VIEWER_ID_RE = /^[a-zA-Z0-9-]+$/;

type ViewerStore = Map<string, number>;

function getStore(): ViewerStore {
  const g = globalThis as typeof globalThis & { __nexlifyLivestreamViewers?: ViewerStore };
  if (!g.__nexlifyLivestreamViewers) {
    g.__nexlifyLivestreamViewers = new Map();
  }
  return g.__nexlifyLivestreamViewers;
}

function prune(now = Date.now()): void {
  const store = getStore();
  for (const [id, lastSeen] of store) {
    if (now - lastSeen > STALE_MS) store.delete(id);
  }
}

export function isValidViewerId(id: string): boolean {
  return id.length > 0 && id.length <= MAX_VIEWER_ID_LEN && VIEWER_ID_RE.test(id);
}

export function touchViewer(id: string): void {
  if (!isValidViewerId(id)) return;
  getStore().set(id, Date.now());
  prune();
}

export function removeViewer(id: string): void {
  if (!isValidViewerId(id)) return;
  getStore().delete(id);
}

export function getViewerCount(): number {
  prune();
  return getStore().size;
}
