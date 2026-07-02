import { gzipSync } from "zlib";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import path from "path";

const execFileAsync = promisify(execFile);

export async function writeBackupArchive(
  dir: string,
  baseName: string,
  jsonPayload: string,
  format: "json" | "zip" | "gzip"
): Promise<{ filePath: string; format: string }> {
  if (format === "json") {
    const filePath = path.join(dir, `${baseName}.json`);
    await writeFile(filePath, jsonPayload, "utf8");
    return { filePath, format: "json" };
  }

  if (format === "gzip" || format === "zip") {
    const gzPath = path.join(dir, `${baseName}.json.gz`);
    await writeFile(gzPath, gzipSync(Buffer.from(jsonPayload, "utf8")));
    if (format === "gzip") return { filePath: gzPath, format: "gzip" };
  }

  const jsonPath = path.join(dir, `${baseName}.json`);
  const zipPath = path.join(dir, `${baseName}.zip`);
  await writeFile(jsonPath, jsonPayload, "utf8");
  try {
    await execFileAsync("zip", ["-j", zipPath, jsonPath], { timeout: 120_000 });
    await unlink(jsonPath).catch(() => {});
    return { filePath: zipPath, format: "zip" };
  } catch {
    const gzPath = path.join(dir, `${baseName}.json.gz`);
    await writeFile(gzPath, gzipSync(Buffer.from(jsonPayload, "utf8")));
    await unlink(jsonPath).catch(() => {});
    return { filePath: gzPath, format: "gzip (zip unavailable)" };
  }
}
