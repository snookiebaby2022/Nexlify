/**
 * k6: 1000 concurrent player_api.php auth requests.
 * Asserts p95 < 300ms (and reports p50/p99 via summary).
 *
 * Run via: npm run test:load -- player-api
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import { baseUrl, lineCreds, authThresholds, reportTags } from "../lib/helpers.js";

const duration = new Trend("player_api_auth_ms", true);
const failRate = new Rate("player_api_auth_errors");
const okCount = new Counter("player_api_auth_ok");

const vus = Number(__ENV.LOAD_AUTH_VUS || 1000);

export const options = {
  scenarios: {
    player_api_auth: {
      executor: "per-vu-iterations",
      vus,
      iterations: Number(__ENV.LOAD_AUTH_ITERS || 3),
      maxDuration: __ENV.LOAD_AUTH_MAX || "2m",
      gracefulStop: "30s",
    },
  },
  thresholds: authThresholds(),
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
};

export default function () {
  const { username, password } = lineCreds();
  const url = `${baseUrl()}/player_api.php?username=${encodeURIComponent(
    username
  )}&password=${encodeURIComponent(password)}`;

  const res = http.get(url, {
    tags: reportTags("player_api_auth"),
    timeout: "30s",
    headers: {
      "User-Agent": "Nexlify-LoadTest/1.0",
      "X-Forwarded-For": `203.0.113.${(__VU % 250) + 1}`,
    },
  });

  duration.add(res.timings.duration);
  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "has user_info or auth_info": (r) => {
      try {
        const j = r.json();
        return Boolean(j && (j.user_info || j.auth || j.username));
      } catch {
        return false;
      }
    },
  });
  failRate.add(!ok);
  if (ok) okCount.add(1);
  sleep(0.01);
}
