import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const OBFUSCATION_MAP = {};

function obfuscateString(str) {
  return str
    .split("")
    .map((c) => String.fromCharCode(c.charCodeAt(0) ^ 0x42))
    .join("");
}

function obfuscateLicenseKeywords(content) {
  const keywords = [
    "revalidateStoredLicense",
    "activateLicenseKey",
    "clearStoredLicense",
    "getStoredLicense",
    "readLicenseRawKey",
    "validateWithVendor",
    "verifyOnlineIfRequired",
    "getOrCreateInstanceId",
    "startupLicenseValidation",
    "heartbeatCheck",
    "startupValidationOk",
  ];

  let result = content;
  for (const kw of keywords) {
    if (!OBFUSCATION_MAP[kw]) {
      OBFUSCATION_MAP[kw] = obfuscateString(kw);
    }
    result = result.split(kw).join(OBFUSCATION_MAP[kw]);
  }
  return result;
}

function processDir(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      if (entry === "chunks" || entry === "server") {
        processDir(fullPath);
      }
    } else if (entry.endsWith(".js")) {
      try {
        const content = readFileSync(fullPath, "utf-8");
        if (
          content.includes("revalidateStoredLicense") ||
          content.includes("activateLicenseKey") ||
          content.includes("clearStoredLicense") ||
          content.includes("validateWithVendor") ||
          content.includes("startupLicenseValidation") ||
          content.includes("heartbeatCheck")
        ) {
          writeFileSync(fullPath, obfuscateLicenseKeywords(content));
          console.log(`  Obfuscated: ${fullPath}`);
        }
      } catch { /* skip */ }
    }
  }
}

const buildDir = join(process.cwd(), ".next");
console.log("[obfuscate] Scanning build output for license functions...");
processDir(join(buildDir, "server"));
processDir(join(buildDir, "static"));
console.log("[obfuscate] Done.");
