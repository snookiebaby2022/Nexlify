import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

if (pkg.overrides?.next) {
  console.error(
    "\nERROR: package.json has overrides.next — this causes EOVERRIDE with npm audit.\n" +
      "Remove the entire \"overrides\" block (or at least \"next\") from package.json,\n" +
      "then run: rm -rf node_modules package-lock.json && npm install\n"
  );
  process.exit(1);
}

const nextVer = pkg.dependencies?.next ?? "";
if (nextVer.startsWith("16.")) {
  console.error(
    "\nERROR: Next 16 requires Node >= 20.9. On Node 18 use: npm install next@15.5.19\n"
  );
  process.exit(1);
}
if (nextVer !== "15.5.19") {
  console.warn(`WARN: recommended dependencies.next = "15.5.19", got "${nextVer}"`);
}

console.log("package.json OK — next is", pkg.dependencies.next, "(no next override)");
