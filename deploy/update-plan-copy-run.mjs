import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new Database(path.join(root, "data/nexlify.db"));
const sql = fs.readFileSync(path.join(root, "deploy/update-plan-copy.sql"), "utf8");

for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
  db.exec(`${stmt};`);
}

console.log("Plan copy updated");
