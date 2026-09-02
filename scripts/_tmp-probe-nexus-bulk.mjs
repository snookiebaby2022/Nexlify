import { PrismaClient } from "@prisma/client";

const UA = "Lavf/58.29.100";
const USER = "sme_snooki_c7weo";
const p = new PrismaClient();
const line = await p.line.findFirst({ where: { username: USER }, select: { password: true } });
if (!line) {
  console.log("no line");
  process.exit(1);
}

const base = `http://127.0.0.1/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(line.password)}`;
const cats = await fetch(`${base}&action=get_live_categories`, { headers: { "User-Agent": UA } }).then((r) => r.json());
const uk = cats.find((c) => c.category_name === "UK | Entertainment");
console.log("category", uk);

const bulk = await fetch(`${base}&action=get_live_streams`, { headers: { "User-Agent": UA } }).then((r) => r.json());
console.log("bulk len", bulk.length, "typeof category_id", typeof bulk[0]?.category_id);

const id = uk?.category_id;
const matchStr = bulk.filter((s) => String(s.category_id) === String(id));
const matchNum = bulk.filter((s) => Number(s.category_id) === Number(id));
const matchArr = bulk.filter(
  (s) => Array.isArray(s.category_ids) && s.category_ids.some((x) => Number(x) === Number(id))
);
console.log("matches", { matchStr: matchStr.length, matchNum: matchNum.length, matchArr: matchArr.length });
console.log("sample", matchStr[0]?.name, matchStr[0]?.category_id, matchStr[0]?.category_ids);

// Check if category_id as number in bulk would help strict === 
const strictFail = bulk.filter((s) => s.category_id === id).length;
const strictNumFail = bulk.filter((s) => s.category_id === Number(id)).length;
console.log("strict eq string id", strictFail, "strict eq number id", strictNumFail);

await p.$disconnect();
