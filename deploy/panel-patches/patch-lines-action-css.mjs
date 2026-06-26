import fs from "fs";
import path from "path";

const globalsPath = process.argv[2];
const patchPath = process.argv[3];
if (!globalsPath || !patchPath) {
  console.error("Usage: node patch-lines-action-css.mjs <globals.css> <lines-action-menu.css>");
  process.exit(1);
}

const patch = fs.readFileSync(patchPath, "utf8");
let css = fs.readFileSync(globalsPath, "utf8");

const spinMarker = "/* Hide number input spin buttons";
const wrapMarker = ".xui-lines-action-wrap";
const btnMarker = ".xui-lines-action-btn";

const spinIdx = css.indexOf(spinMarker);
const wrapIdx = css.indexOf(wrapMarker);
const btnIdx = css.indexOf(btnMarker);

let start = wrapIdx >= 0 ? wrapIdx : btnIdx;
if (start < 0 && spinIdx >= 0) {
  start = spinIdx;
  css = css.slice(0, start) + patch + "\n\n" + css.slice(start);
} else if (start >= 0 && spinIdx > start) {
  css = css.slice(0, start) + patch + "\n\n" + css.slice(spinIdx);
} else if (start >= 0) {
  css = css.slice(0, start) + patch + "\n";
} else {
  css = css + "\n" + patch + "\n";
}

const tdOld = `.xui-lines-td--actions {
  width: 6.5rem;
  text-align: right;
  white-space: nowrap;
}`;
const tdNew = `.xui-lines-td--actions {
  width: 7.5rem;
  min-width: 7.5rem;
  text-align: right;
  white-space: nowrap;
  overflow: visible;
  position: relative;
  z-index: 1;
}`;
if (css.includes(tdOld)) {
  css = css.replace(tdOld, tdNew);
} else if (!css.includes("min-width: 7.5rem")) {
  css = css.replace(
    /\.xui-lines-td--actions\s*\{[^}]*\}/,
    tdNew
  );
}

fs.writeFileSync(globalsPath, css);
console.log("Patched lines action menu CSS in", path.basename(globalsPath));
