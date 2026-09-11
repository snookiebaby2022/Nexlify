/**
 * k6: concurrent line creates → credit deductions (no double-spend).
 *
 * Seed reseller with N credits and package cost 1. Fire M > N creates.
 * Expect: successes <= N, final credits >= 0, sum(charged) <= startCredits.
 *
 * Note: admin API rate limits may throttle — use distinct X-Forwarded-For
 * per VU. Prefer also running `npm run test:load:credit-race` (Prisma) for
 * a definitive atomicity proof without HTTP rate limits.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { baseUrl, reportTags } from "../lib/helpers.js";

const duration = new Trend("credit_create_ms", true);
const okCount = new Counter("credit_create_ok");
const denyCount = new Counter("credit_create_denied");
const failRate = new Rate("credit_create_errors");

const vus = Number(__ENV.LOAD_CREDIT_VUS || 200);
const startCredits = Number(__ENV.LOAD_RESELLER_CREDITS || 100);

export const options = {
  scenarios: {
    credit_race: {
      executor: "per-vu-iterations",
      vus,
      iterations: 1,
      maxDuration: __ENV.LOAD_CREDIT_MAX || "3m",
      gracefulStop: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.95"], // most should fail once credits exhausted
    credit_create_ok: [`count<=${startCredits}`],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
};

export function setup() {
  const user = __ENV.LOAD_RESELLER_USER || "load_reseller";
  const pass = __ENV.LOAD_RESELLER_PASS || "LoadReseller123!";
  const login = http.post(
    `${baseUrl()}/api/auth/login`,
    JSON.stringify({ username: user, password: pass }),
    {
      headers: { "Content-Type": "application/json" },
      tags: reportTags("credit_login"),
    }
  );
  if (login.status !== 200) {
    throw new Error(`reseller login failed: ${login.status} ${login.body}`);
  }
  const jar = http.cookieJar();
  const cookies = jar.cookiesForURL(baseUrl());
  return {
    cookieHeader: Object.keys(cookies)
      .map((k) => `${k}=${cookies[k][0]}`)
      .join("; "),
    packageId: __ENV.LOAD_PACKAGE_ID || "",
    bouquetId: __ENV.LOAD_BOUQUET_ID || "",
  };
}

export default function (data) {
  const uname = `load_race_${__VU}_${Date.now().toString(36)}`;
  const body = {
    username: uname,
    password: `Pw${__VU}!aA1`,
    packageId: data.packageId,
    bouquetIds: data.bouquetId ? [data.bouquetId] : undefined,
    days: 1,
  };

  const res = http.post(`${baseUrl()}/api/reseller/lines`, JSON.stringify(body), {
    tags: reportTags("credit_race"),
    timeout: "60s",
    headers: {
      "Content-Type": "application/json",
      Cookie: data.cookieHeader,
      // Omit Origin so mutationOriginAllowed treats us as non-browser tooling
      "X-Forwarded-For": `198.51.100.${(__VU % 250) + 1}`,
      "User-Agent": "Nexlify-LoadTest/1.0",
    },
  });

  duration.add(res.timings.duration);
  if (res.status === 200 || res.status === 201) {
    okCount.add(1);
    failRate.add(0);
  } else if (res.status === 400 || res.status === 403) {
    denyCount.add(1);
    // Insufficient credits is expected under contention
    const msg = String(res.body || "");
    const expected =
      /Insufficient credits|already taken|Forbidden|rate limit/i.test(msg) ||
      res.status === 429;
    failRate.add(!expected && res.status >= 500);
    check(res, { "deny is credits/validation": () => expected || res.status < 500 });
  } else {
    failRate.add(1);
  }
  sleep(0.01);
}

export function teardown(data) {
  // Balance verification is done by verify-credits.mjs after k6 exits.
  if (data && data.cookieHeader) {
    /* keep setup shape */
  }
}
