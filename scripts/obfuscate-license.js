import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const OBFUSCATION_MAP = {};

function obfuscateString(str) {
  // Produce a valid JS identifier (starts with _, rest [0-9a-z]) so the
  // renamed tokens never break parsing. Deterministic per keyword.
  let out = "_";
  for (let i = 0; i < str.length; i++) {
    out += (str.charCodeAt(i) ^ 0x42).toString(36);
  }
  return out;
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
  // Skip files that break when modified (instrumentation hook, middleware)
  const skipFiles = new Set(["instrumentation.js", "middleware.js"]);
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
      if (skipFiles.has(entry)) continue;
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

const buildDir = join(process.cwd(), process.env.NEXLIFY_DIST_DIR?.trim() || ".next");
console.log("[obfuscate] Scanning build output for license functions...");
processDir(join(buildDir, "server"));
processDir(join(buildDir, "static"));
console.log("[obfuscate] Done.");
