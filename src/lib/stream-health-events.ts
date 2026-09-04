export const STREAM_HEALTH_CHANGED = "nexlify-stream-health-changed";

export function notifyStreamHealthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STREAM_HEALTH_CHANGED));
}
