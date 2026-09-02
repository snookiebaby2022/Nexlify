import { PrismaClient } from "@prisma/client";

const UA = "NexusTV/1.0 Lavf/58.29.100";
const USER = "sme_snooki_c7weo";
const p = new PrismaClient();
const line = await p.line.findFirst({ where: { username: USER }, select: { password: true } });
if (!line) {
  console.log("no line");
  process.exit(1);
}

const base = `http://127.0.0.1/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(line.password)}`;
const cats = await fetch(`${base}&action=get_live_categories`, { headers: { "User-Agent": UA } }).then((r) =>
  r.json()
);
const uk = cats.find((c) => c.category_name === "UK | Entertainment");
const bulk = await fetch(`${base}&action=get_live_streams`, { headers: { "User-Agent": UA } }).then((r) => r.json());
const id = uk?.category_id;
const sample = bulk.find((s) => String(s.category_id) === String(id));
console.log("uk cat", uk);
console.log("typeof cat category_id", typeof id, "typeof stream category_id", typeof sample?.category_id);
console.log("strict eq", bulk.filter((s) => s.category_id === id).length);
console.log("strict num eq", bulk.filter((s) => s.category_id === Number(id)).length);
console.log("sample stream", sample?.name, sample?.category_id);

await p.$disconnect();
