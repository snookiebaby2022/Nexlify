/**
 * Shared helpers for k6 scripts (Goja — no Node APIs).
 * Env is injected by run.mjs via k6 -e KEY=value.
 */
export function baseUrl() {
  const u = __ENV.LOAD_BASE_URL || "http://127.0.0.1:13100";
  return u.replace(/\/$/, "");
}

export function lineCreds() {
  return {
    username: __ENV.LOAD_LINE_USER || "load_line",
    password: __ENV.LOAD_LINE_PASS || "LoadLine123!",
  };
}

export function streamId() {
  return __ENV.LOAD_STREAM_ID || "";
}

export function internalSecret() {
  return __ENV.PANEL_INTERNAL_SECRET || "";
}

export function reportTags(name) {
  return { scenario: name };
}

/** Standard summary thresholds: p95 < 300ms for auth; looser for heavy M3U. */
export function authThresholds() {
  return {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(50)<150", "p(95)<300", "p(99)<800"],
  };
}

export function heavyThresholds() {
  return {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(50)<5000", "p(95)<30000", "p(99)<60000"],
  };
}

export function liveAuthThresholds() {
  return {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(50)<200", "p(95)<500", "p(99)<1500"],
  };
}
