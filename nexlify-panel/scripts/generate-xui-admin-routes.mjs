/**
 * Optional: create physical src/app/admin/{slug}/page.tsx files (like XUI PHP admin folder).
 * Dynamic route src/app/admin/[module]/page.tsx already handles all slugs.
 *
 * Run: node scripts/generate-xui-admin-routes.mjs
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const root = join(process.cwd(), "src", "app", "admin");
const src = readFileSync(join(process.cwd(), "src", "lib", "xui-admin-modules.ts"), "utf8");

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

const skip = new Set(["modules", "dashboard", "lines", "bouquets", "servers", "settings", "profile", "management", "content", "resellers", "mag", "tickets", "epg", "import", "billing", "connections", "streams", "watch-folders"]);

let created = 0;
for (const { slug, redirect } of modules) {
  if (skip.has(slug)) continue;
  const dir = join(root, slug);
  const pagePath = join(dir, "page.tsx");
  if (existsSync(pagePath)) continue;
  mkdirSync(dir, { recursive: true });
  const safe = slug.replace(/[^a-z0-9_]/gi, "_");
  const content = redirect
    ? `import { redirect } from "next/navigation";

export default function Page() {
  redirect("${redirect}");
}
`
    : `import { AdminModulePage } from "@/components/admin-module-page";

export default function Page() {
  return <AdminModulePage slug="${slug}" />;
}
`;
  writeFileSync(pagePath, content);
  created++;
}
console.log(`Created ${created} physical admin pages (${modules.length} modules in registry).`);
