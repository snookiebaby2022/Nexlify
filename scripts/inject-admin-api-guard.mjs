import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMPORT_LINE = `import { guardAdminApiRequest } from "@/lib/admin-route-guard";`;
const GUARD_BLOCK = `  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;
`;

function walkRouteFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walkRouteFiles(full, out);
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

const files = [
  ...walkRouteFiles(path.join(ROOT, "src/app/api/admin")),
  ...walkRouteFiles(path.join(ROOT, "src/app/api/reseller")),
];

let updated = 0;
for (const file of files) {
  let src = readFileSync(file, "utf8");
  if (src.includes("guardAdminApiRequest")) continue;
  if (!src.includes("NextRequest")) continue;

  if (!src.includes(IMPORT_LINE)) {
    const lines = src.split("\n");
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^import .+ from .+;?\s*$/.test(lines[i])) lastImport = i;
    }
    if (lastImport >= 0) lines.splice(lastImport + 1, 0, IMPORT_LINE);
    else lines.unshift(IMPORT_LINE);
    src = lines.join("\n");
  }

  const handlerRe = /export async function (GET|POST|PUT|PATCH|DELETE|HEAD)\(\s*(\w+)\s*:\s*NextRequest[^)]*\)\s*\{/g;
  let changed = false;
  src = src.replace(handlerRe, (match, _method, param) => {
    changed = true;
    return `${match}\n  const rateLimited = await guardAdminApiRequest(${param});\n  if (rateLimited) return rateLimited;\n`;
  });

  if (changed) {
    writeFileSync(file, src);
    updated++;
  }
}

console.log(`Updated ${updated} route file(s).`);
