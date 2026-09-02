#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const UA = "NexusTV/1.0 Lavf/58.29.100";
const USER = "sme_snooki_c7weo";
const p = new PrismaClient();

const line = await p.line.findFirst({
  where: { username: USER },
  select: { password: true },
});
if (!line) {
  console.log("LINE_MISSING");
  process.exit(1);
}

async function probe(action, extra = "") {
  const url = `http://127.0.0.1/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(line.password)}&action=${action}${extra}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.log(action, "NON_JSON", res.status, text.slice(0, 200));
    return;
  }
  if (action === "get_server_info" || !action) {
    console.log("server_info", JSON.stringify(data.server_info ?? data, null, 0).slice(0, 400));
    return;
  }
  if (Array.isArray(data)) {
    console.log(action, "count", data.length, "sample", JSON.stringify(data[0] ?? {}).slice(0, 120));
    if (action === "get_live_streams" && data.length) {
      const zeros = data.filter((s) => String(s.category_id) === "0").length;
      console.log("category_id_zero", zeros, "of", data.length);
    }
    return;
  }
  console.log(action, JSON.stringify(data).slice(0, 300));
}

await probe("", "");
await probe("get_server_info");
await probe("get_live_categories");
await probe("get_live_streams");
await probe("get_live_streams", "&category_id=707056019");
const catRes = await fetch(
  `http://127.0.0.1/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(line.password)}&action=get_live_streams&category_id=707056019`,
  { headers: { "User-Agent": UA } }
);
const catStreams = await catRes.json();
const sid = catStreams?.[0]?.stream_id;
if (sid) {
  await probe("get_short_epg", `&stream_id=${sid}&limit=2`);
} else {
  console.log("no stream_id for epg probe");
}

await p.$disconnect();
