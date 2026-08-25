import { deflateRawSync, crc32 } from "node:zlib";
import { createReadStream, createWriteStream } from "node:fs";
import { writeFile, unlink, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import path from "node:path";

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n & 0xffff);
  return b;
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}

/** PKZIP local + central + EOCD for a single deflated entry (fits in memory). */
export function zipSingleBuffer(entryName: string, data: Buffer): Buffer {
  const name = Buffer.from(entryName, "utf8");
  const compressed = deflateRawSync(data);
  const crc = crc32(data) >>> 0;
  const local = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    u16(20),
    u16(0),
    u16(8),
    u16(0),
    u16(0),
    u32(crc),
    u32(compressed.length),
    u32(data.length),
    u16(name.length),
    u16(0),
    name,
    compressed,
  ]);
  const central = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x01, 0x02]),
    u16(20),
    u16(20),
    u16(0),
    u16(8),
    u16(0),
    u16(0),
    u32(crc),
    u32(compressed.length),
    u32(data.length),
    u16(name.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    name,
  ]);
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(1),
    u16(1),
    u32(central.length),
    u32(local.length),
    u16(0),
  ]);
  return Buffer.concat([local, central, eocd]);
}

async function crc32File(filePath: string): Promise<number> {
  let crc = 0;
  await pipeline(
    createReadStream(filePath),
    new Writable({
      write(chunk, _enc, cb) {
        crc = crc32(chunk as Buffer, crc);
        cb();
      },
    })
  );
  return crc >>> 0;
}

/** Wrap an on-disk file in a .zip using STORE (no extra RAM for multi-GB backups). */
export async function zipStoreFile(srcPath: string, zipPath: string, entryName: string): Promise<void> {
  const st = await stat(srcPath);
  const name = Buffer.from(entryName, "utf8");
  const crc = await crc32File(srcPath);
  const localHeader = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    u16(20),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(crc),
    u32(st.size >>> 0),
    u32(st.size >>> 0),
    u16(name.length),
    u16(0),
    name,
  ]);
  const out = createWriteStream(zipPath);
  await new Promise<void>((resolve, reject) => {
    out.write(localHeader, (err) => (err ? reject(err) : resolve()));
  });
  await new Promise<void>((resolve, reject) => {
    const rs = createReadStream(srcPath);
    rs.on("error", reject);
    out.on("error", reject);
    rs.on("end", () => resolve());
    rs.pipe(out, { end: false });
  });
  const central = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x01, 0x02]),
    u16(20),
    u16(20),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(crc),
    u32(st.size >>> 0),
    u32(st.size >>> 0),
    u16(name.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    name,
  ]);
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(1),
    u16(1),
    u32(central.length),
    u32(localHeader.length),
    u16(0),
  ]);
  await new Promise<void>((resolve, reject) => {
    out.write(Buffer.concat([central, eocd]), (err) => {
      if (err) reject(err);
      else out.end(resolve);
    });
  });
}

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

  if (format === "gzip") {
    const { gzipSync } = await import("node:zlib");
    const gzPath = path.join(dir, `${baseName}.json.gz`);
    await writeFile(gzPath, gzipSync(Buffer.from(jsonPayload, "utf8")));
    return { filePath: gzPath, format: "gzip" };
  }

  const zipPath = path.join(dir, `${baseName}.zip`);
  await writeFile(zipPath, zipSingleBuffer(`${baseName}.json`, Buffer.from(jsonPayload, "utf8")));
  return { filePath: zipPath, format: "zip" };
}

export async function zipJsonFileOnDisk(jsonPath: string, zipPath: string, entryName: string): Promise<void> {
  await zipStoreFile(jsonPath, zipPath, entryName);
  await unlink(jsonPath).catch(() => {});
}
