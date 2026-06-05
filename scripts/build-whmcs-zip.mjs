import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const root = process.cwd();
const srcDir = path.join(root, "whmcs-module", "nexlify");
const distDir = path.join(root, "dist");
const zipPath = path.join(distDir, "nexlify-whmcs-module.zip");

if (!fs.existsSync(srcDir)) {
  console.error("Missing whmcs-module/nexlify");
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const isWin = process.platform === "win32";
try {
  if (isWin) {
    const moduleRoot = path.join(root, "whmcs-module");
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${path.join(moduleRoot, "nexlify")}' -DestinationPath '${zipPath}' -Force"`,
      { stdio: "inherit" }
    );
  } else {
    execSync(`cd "${path.join(root, "whmcs-module")}" && zip -r "${zipPath}" nexlify`, {
      stdio: "inherit",
    });
  }
  console.log("Created", zipPath);
} catch (e) {
  console.error("Zip failed. Manually zip whmcs-module/nexlify → dist/nexlify-whmcs-module.zip");
  process.exit(1);
}
