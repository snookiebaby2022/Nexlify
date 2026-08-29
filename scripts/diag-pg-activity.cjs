#!/usr/bin/env node
process.chdir(require("path").join(__dirname, ".."));
require("./load-env.cjs").loadEnv();
const { execSync } = require("child_process");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("no DATABASE_URL");
  process.exit(1);
}
const sql = `
SELECT pid, state, wait_event_type, wait_event,
  left(replace(query, E'\\n', ' '), 100) AS q,
  now() - query_start AS age
FROM pg_stat_activity
WHERE datname = current_database() AND pid <> pg_backend_pid()
  AND state <> 'idle'
ORDER BY query_start;
`;
try {
  console.log(execSync(`psql "${url}" -c "${sql.replace(/"/g, '\\"')}"`, { encoding: "utf8" }));
} catch (e) {
  console.log(e.stdout?.toString() || e.message);
}
