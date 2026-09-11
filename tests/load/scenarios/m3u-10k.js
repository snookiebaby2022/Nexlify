/**
 * k6: M3U generation for an account with ~10,000 channels (get.php).
 * Reports duration percentiles; body size should reflect EXTINF count.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import { baseUrl, lineCreds, heavyThresholds, reportTags } from "../lib/helpers.js";

const duration = new Trend("m3u_gen_ms", true);
const failRate = new Rate("m3u_gen_errors");
const bytes = new Trend("m3u_bytes");
const okCount = new Counter("m3u_gen_ok");

const expectChannels = Number(__ENV.LOAD_CHANNEL_COUNT || 10000);
const vus = Number(__ENV.LOAD_M3U_VUS || 5);
const iters = Number(__ENV.LOAD_M3U_ITERS || 2);

export const options = {
  scenarios: {
    m3u_10k: {
      executor: "per-vu-iterations",
      vus,
      iterations: iters,
      maxDuration: __ENV.LOAD_M3U_MAX || "10m",
      gracefulStop: "60s",
    },
  },
  thresholds: heavyThresholds(),
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
};

export default function () {
  const { username, password } = lineCreds();
  const url =
    `${baseUrl()}/get.php?username=${encodeURIComponent(username)}` +
    `&password=${encodeURIComponent(password)}&type=m3u_plus&output=ts`;

  const res = http.get(url, {
    tags: reportTags("m3u_10k"),
    timeout: "180s",
    headers: {
      "User-Agent": "Nexlify-LoadTest/1.0",
      "X-Forwarded-For": `203.0.113.${(__VU % 250) + 1}`,
    },
  });

  duration.add(res.timings.duration);
  bytes.add(res.body ? res.body.length : 0);

  const body = res.body || "";
  const extinf = (body.match(/#EXTINF/g) || []).length;
  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "starts with #EXTM3U": () => body.startsWith("#EXTM3U"),
    [`EXTINF >= ${Math.floor(expectChannels * 0.9)}`]: () =>
      extinf >= Math.floor(expectChannels * 0.9),
  });
  failRate.add(!ok);
  if (ok) okCount.add(1);
  sleep(0.05);
}
