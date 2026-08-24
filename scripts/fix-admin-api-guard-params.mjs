import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");

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

const handlerRe =
  /export async function (GET|POST|PUT|PATCH|DELETE|HEAD)\(\s*(\w+)\s*:\s*NextRequest[^)]*\)\s*\{(\s*const rateLimited = await guardAdminApiRequest\()req(\);\s*\n\s*if \(rateLimited\) return rateLimited;\s*\n)/g;

let fixed = 0;
for (const file of files) {
  let src = readFileSync(file, "utf8");
  const next = src.replace(handlerRe, (_m, method, param, prefix, suffix) => {
    return `export async function ${method}(${param}: NextRequest${
      _m.includes("ctx:") || _m.includes("params:") ? _m.slice(_m.indexOf(param) + param.length, _m.indexOf(") {")) : ""
    }) {${prefix}${param}${suffix}`;
  });

  // Simpler second pass: fix guard line param per handler block
  let out = src;
  const blockRe =
    /export async function (GET|POST|PUT|PATCH|DELETE|HEAD)\(\s*(\w+)\s*:\s*(?:NextRequest|Request)[^)]*\)\s*\{[\s\S]*?const rateLimited = await guardAdminApiRequest\(req\)/g;
  out = src.replace(blockRe, (block) => {
    const paramMatch = block.match(
      /export async function \w+\(\s*(\w+)\s*:\s*(?:NextRequest|Request)/
    );
    const param = paramMatch?.[1] ?? "req";
    if (param === "req") return block;
    fixed++;
    return block.replace("guardAdminApiRequest(req)", `guardAdminApiRequest(${param})`);
  });

  if (out !== src) {
    writeFileSync(file, out);
  }
}

console.log(`Fixed ${fixed} handler guard param(s).`);
