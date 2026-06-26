import fs from "fs";
import path from "path";

const globalsPath = process.argv[2];
if (!globalsPath) {
  console.error("Usage: node patch-settings-sidebar-css.mjs <globals.css>");
  process.exit(1);
}

const block = `.settings-sidebar-version {
  flex-shrink: 0;
  padding: 0.65rem 1rem 0.85rem;
  border-top: 1px solid var(--border);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: rgba(148, 163, 184, 0.95);
  text-align: center;
}
`;

let css = fs.readFileSync(globalsPath, "utf8");
if (css.includes(".settings-sidebar-version")) {
  css = css.replace(/\.settings-sidebar-version\s*\{[^}]*\}/, block.trim());
} else if (css.includes(".panel-sidebar-version")) {
  css = css.replace(
    /(\.panel-sidebar-version\s*\{[^}]*\})/,
    `$1\n\n${block.trim()}`
  );
} else {
  css = css.trimEnd() + "\n\n" + block;
}

fs.writeFileSync(globalsPath, css);
console.log("Patched settings sidebar CSS in", path.basename(globalsPath));
