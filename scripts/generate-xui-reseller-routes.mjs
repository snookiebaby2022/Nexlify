import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const root = join(process.cwd(), "src", "app", "reseller");
const src = readFileSync(join(process.cwd(), "src", "lib", "xui-reseller-modules.ts"), "utf8");

const modules = [];
let current = null;
for (const line of src.split("\n")) {
  const slugM = line.match(/slug:\s*"([^"]+)"/);
  if (slugM) {
    if (current) modules.push(current);
    current = { slug: slugM[1], redirect: null };
  }
  const redM = line.match(/redirect:\s*"([^"]+)"/);
  if (redM && current) current.redirect = redM[1];
}
if (current) modules.push(current);

const skip = new Set([
  "modules",
  "dashboard",
  "lines",
  "credits",
  "profile",
  "tickets",
  "users",
  "streams",
  "movies",
  "episodes",
  "mags",
]);

let created = 0;
for (const { slug, redirect } of modules) {
  if (skip.has(slug)) continue;
  const dir = join(root, slug);
  const pagePath = join(dir, "page.tsx");
  if (existsSync(pagePath)) continue;
  mkdirSync(dir, { recursive: true });
  const content = redirect
    ? `import { redirect } from "next/navigation";

export default function Page() {
  redirect("${redirect}");
}
`
    : `import { ResellerModulePage } from "@/components/reseller-module-page";

export default function Page() {
  return <ResellerModulePage slug="${slug}" />;
}
`;
  writeFileSync(pagePath, content);
  created++;
}
console.log(`Created ${created} reseller admin-style pages.`);
