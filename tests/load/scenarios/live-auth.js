/**
 * k6: 5000 simultaneous line-authorization checks via /api/internal/live-auth.
 * Uses PANEL_INTERNAL_SECRET + RFC5737 client IPs (skip geo/DDoS heavy paths).
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import {
  baseUrl,
  lineCreds,
  streamId,
  internalSecret,
  liveAuthThresholds,
  reportTags,
} from "../lib/helpers.js";

const duration = new Trend("live_auth_ms", true);
const failRate = new Rate("live_auth_errors");
const okCount = new Counter("live_auth_ok");

const vus = Number(__ENV.LOAD_LIVE_AUTH_VUS || 5000);

export const options = {
  scenarios: {
    live_auth: {
      executor: "per-vu-iterations",
      vus,
      iterations: Number(__ENV.LOAD_LIVE_AUTH_ITERS || 1),
      maxDuration: __ENV.LOAD_LIVE_AUTH_MAX || "3m",
      gracefulStop: "45s",
    },
  },
  thresholds: liveAuthThresholds(),
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
};

export default function () {
  const { username, password } = lineCreds();
  const sid = streamId();
  if (!sid) {
    failRate.add(1);
    return;
  }

  const uri = `/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${sid}.ts`;
  const url = `${baseUrl()}/api/internal/live-auth?uri=${encodeURIComponent(uri)}`;
  const secret = internalSecret();

  const res = http.get(url, {
    tags: reportTags("live_auth"),
    timeout: "30s",
    headers: {
      "User-Agent": "Nexlify-LoadTest/1.0",
      "X-Panel-Internal-Secret": secret,
      "X-Forwarded-For": `203.0.113.${(__VU % 250) + 1}`,
      "X-Original-Uri": uri,
    },
  });

  duration.add(res.timings.duration);
  // 200 = authorized splice; 204 = passthrough (still a valid auth path decision)
  const ok = check(res, {
    "status 200 or 204": (r) => r.status === 200 || r.status === 204,
    "not 401/403": (r) => r.status !== 401 && r.status !== 403,
  });
  failRate.add(!ok);
  if (ok) okCount.add(1);
  sleep(0.01);
}
