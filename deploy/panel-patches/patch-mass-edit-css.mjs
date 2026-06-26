import fs from "fs";
import path from "path";

const globalsPath = process.argv[2];
const patchPath = process.argv[3];
if (!globalsPath || !patchPath) {
  console.error("Usage: node patch-mass-edit-css.mjs <globals.css> <mass-edit-lines.css>");
  process.exit(1);
}

const patch = fs.readFileSync(patchPath, "utf8");
let css = fs.readFileSync(globalsPath, "utf8");

const marker = "/* Mass Edit Lines";
const start = css.indexOf(marker);

if (start >= 0) {
  const nextSection = css.indexOf("\n/* ", start + marker.length);
  const end = nextSection >= 0 ? nextSection : css.length;
  css = css.slice(0, start) + patch.trim() + "\n\n" + css.slice(end).replace(/^\n+/, "");
} else {
  css = css.trimEnd() + "\n\n" + patch.trim() + "\n";
}

fs.writeFileSync(globalsPath, css);
console.log("Patched mass edit CSS in", path.basename(globalsPath));
