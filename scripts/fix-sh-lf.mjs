/**
 * Strip CRLF from shell scripts (run on Windows before git push / VPS upload).
 * Usage: node scripts/fix-sh-lf.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function collectSh(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      collectSh(path, out);
    } else if (name.endsWith(".sh")) {
      out.push(path);
    }
  }
  return out;
}

let fixed = 0;
for (const path of collectSh(root)) {
  const raw = readFileSync(path, "utf8");
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const out = text.endsWith("\n") ? text : `${text}\n`;
  if (out !== raw) {
    writeFileSync(path, out, "utf8");
    fixed++;
  }
}
console.log(
  `Checked ${collectSh(root).length} shell script(s); normalized LF in ${fixed} file(s).`
);
