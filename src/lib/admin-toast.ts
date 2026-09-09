export type AdminToastTone = "success" | "error" | "info";

export type AdminToastPayload = {
  id: number;
  message: string;
  tone: AdminToastTone;
};

type Listener = (toasts: AdminToastPayload[]) => void;

let seq = 0;
const toasts: AdminToastPayload[] = [];
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  const snapshot = [...toasts];
  for (const listener of listeners) listener(snapshot);
}

function dismiss(id: number) {
  const idx = toasts.findIndex((t) => t.id === id);
  if (idx >= 0) toasts.splice(idx, 1);
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  emit();
}

export function subscribeAdminToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener([...toasts]);
  return () => listeners.delete(listener);
}

export function dismissAdminToast(id: number) {
  dismiss(id);
}

/** Lightweight admin feedback (replaces silent success / alert() for common actions). */
export function adminToast(message: string, tone: AdminToastTone = "info", ms = 4200) {
  const text = String(message ?? "").trim();
  if (!text) return;
  const id = ++seq;
  toasts.push({ id, message: text, tone });
  if (toasts.length > 4) {
    const dropped = toasts.shift();
    if (dropped) {
      const t = timers.get(dropped.id);
      if (t) {
        clearTimeout(t);
        timers.delete(dropped.id);
      }
    }
  }
  timers.set(
    id,
    setTimeout(() => dismiss(id), Math.max(1800, ms))
  );
  emit();
}
