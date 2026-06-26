import fs from "fs";
import path from "path";

const globalsPath = process.argv[2];
const patchPath = process.argv[3];
if (!globalsPath || !patchPath) {
  console.error("Usage: node patch-sidebar-version-css.mjs <globals.css> <sidebar-version.css>");
  process.exit(1);
}

const patch = fs.readFileSync(patchPath, "utf8");
let css = fs.readFileSync(globalsPath, "utf8");

const start = css.indexOf(".panel-sidebar-version");
if (start >= 0) {
  const settingsStart = css.indexOf(".settings-sidebar-version", start);
  const progressStart = css.indexOf(".panel-update-progress", start);
  const end =
    settingsStart > start
      ? css.indexOf(".panel-update-progress", settingsStart) > settingsStart
        ? css.indexOf(".panel-update-progress", settingsStart)
        : css.length
      : progressStart > start
        ? progressStart
        : css.length;
  css = css.slice(0, start) + patch.trim() + "\n\n" + css.slice(end).replace(/^\n+/, "");
} else {
  css = css.trimEnd() + "\n\n" + patch.trim() + "\n";
}

fs.writeFileSync(globalsPath, css);
console.log("Patched sidebar version CSS in", path.basename(globalsPath));
