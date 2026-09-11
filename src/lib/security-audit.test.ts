/**
 * Regression tests for SECURITY.md (SEC-01 … SEC-07).
 * Pure / mocked only — no production DB, network, or FFmpeg.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { mutationOriginAllowed } from "./admin-route-guard";
import { sanitizeAiOrderBy } from "./ai-prisma-plan";
import { buildFfmpegArgv, sanitizeFfmpegInputUrl } from "./ffmpeg-agent";
import { hashPassword } from "./password-hash";
import { debitResellerCredits } from "./reseller-credit-charge";
import { escapeHtml } from "./sanitize-text";
import { isAllowedLocalM3uReadPath, isPathInsideDir } from "./watch-folder-m3u";

test("SEC-01: debitResellerCredits uses conditional credits>=amount update", async () => {
  const updateCalls: unknown[] = [];
  const tx = {
    panelUser: {
      findUnique: async () => ({ id: "u1" }),
      updateMany: async (args: unknown) => {
        updateCalls.push(args);
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ credits: 0 }),
    },
    creditTransaction: {
      create: async () => ({}),
    },
  };

  const result = await debitResellerCredits(tx as never, {
    userId: "u1",
    amount: 10,
    note: "line create",
  });
  assert.equal(result.charged, 10);
  assert.deepEqual(updateCalls[0], {
    where: { id: "u1", credits: { gte: 10 } },
    data: { credits: { decrement: 10 } },
  });
});

test("SEC-01: parallel debits — second fails when balance would go negative", async () => {
  let balance = 10;
  const tx = {
    panelUser: {
      findUnique: async () => ({ id: "u1" }),
      updateMany: async (args: {
        where: { credits: { gte: number } };
        data: { credits: { decrement: number } };
      }) => {
        const need = args.where.credits.gte;
        const dec = args.data.credits.decrement;
        if (balance >= need) {
          balance -= dec;
          return { count: 1 };
        }
        return { count: 0 };
      },
      findUniqueOrThrow: async () => ({ credits: balance }),
    },
    creditTransaction: { create: async () => ({}) },
  };

  const a = debitResellerCredits(tx as never, { userId: "u1", amount: 10, note: "a" });
  const b = debitResellerCredits(tx as never, { userId: "u1", amount: 10, note: "b" });
  const settled = await Promise.allSettled([a, b]);
  const ok = settled.filter((s) => s.status === "fulfilled");
  const fail = settled.filter((s) => s.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(fail.length, 1);
  assert.equal(balance, 0);
  assert.match(String((fail[0] as PromiseRejectedResult).reason), /Insufficient credits/);
});

test("SEC-02: M3U path traversal rejected when MEDIA_IMPORT_ROOT unset", () => {
  const upload = path.join(os.tmpdir(), `nexlify-m3u-up-${process.pid}`);
  fs.mkdirSync(upload, { recursive: true });
  const inside = path.join(upload, "ok.m3u");
  fs.writeFileSync(inside, "#EXTM3U\n");
  const escape = path.join(upload, "..", "etc-passwd.m3u");
  assert.equal(isAllowedLocalM3uReadPath(inside, { uploadRoot: upload, mediaRoot: null }), true);
  assert.equal(isAllowedLocalM3uReadPath(escape, { uploadRoot: upload, mediaRoot: null }), false);
  assert.equal(
    isAllowedLocalM3uReadPath("/etc/shadow.m3u", { uploadRoot: upload, mediaRoot: null }),
    false
  );
  assert.equal(isPathInsideDir(path.join(upload, "a.m3u"), upload), true);
  assert.equal(isPathInsideDir(path.join(upload, "..", "x.m3u"), upload), false);
});

test("SEC-02: MEDIA_IMPORT_ROOT confine still blocks escape", () => {
  const upload = path.join(os.tmpdir(), `nexlify-m3u-up2-${process.pid}`);
  const media = path.join(os.tmpdir(), `nexlify-m3u-media-${process.pid}`);
  fs.mkdirSync(upload, { recursive: true });
  fs.mkdirSync(media, { recursive: true });
  const allowed = path.join(media, "list.m3u");
  fs.writeFileSync(allowed, "#EXTM3U\n");
  assert.equal(isAllowedLocalM3uReadPath(allowed, { uploadRoot: upload, mediaRoot: media }), true);
  assert.equal(
    isAllowedLocalM3uReadPath(path.join(media, "..", "secret.m3u"), {
      uploadRoot: upload,
      mediaRoot: media,
    }),
    false
  );
});

test("SEC-03: reseller users PATCH must not echo plaintext password", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/reseller/users/route.ts"),
    "utf8"
  );
  assert.match(src, /password:\s*""/);
  assert.equal(/password:\s*typeof body\.password/.test(src), false);
});

test("SEC-04: mutationOriginAllowed blocks cross-origin POST", () => {
  const evil = new NextRequest("http://panel.local/api/admin/lines", {
    method: "POST",
    headers: {
      host: "panel.local",
      origin: "https://evil.example",
    },
  });
  assert.equal(mutationOriginAllowed(evil), false);

  const ok = new NextRequest("http://panel.local/api/admin/lines", {
    method: "POST",
    headers: {
      host: "panel.local",
      origin: "http://panel.local",
    },
  });
  assert.equal(mutationOriginAllowed(ok), true);

  const getCross = new NextRequest("http://panel.local/api/admin/lines", {
    method: "GET",
    headers: { host: "panel.local", origin: "https://evil.example" },
  });
  assert.equal(mutationOriginAllowed(getCross), true);
});

test("SEC-05: escapeHtml neutralizes XSS payloads used for Stalker names", () => {
  const payload = `<img src=x onerror=alert(1)>`;
  const out = escapeHtml(payload);
  assert.equal(out.includes("<"), false);
  assert.equal(out.includes(">"), false);
  assert.match(out, /&lt;img/);
  const stalker = fs.readFileSync(
    path.join(process.cwd(), "src/lib/stalker-portal-ext.ts"),
    "utf8"
  );
  assert.match(stalker, /name:\s*escapeHtml\(s\.name\)/);
});

test("SEC-06: sanitizeAiOrderBy rejects unknown / secret fields", () => {
  assert.deepEqual(sanitizeAiOrderBy("passwordHash"), { createdAt: "desc" });
  assert.deepEqual(sanitizeAiOrderBy("DROP TABLE"), { createdAt: "desc" });
  assert.deepEqual(sanitizeAiOrderBy({ password: "asc" }), { createdAt: "desc" });
  assert.deepEqual(sanitizeAiOrderBy("username"), { username: "desc" });
  assert.deepEqual(sanitizeAiOrderBy({ createdAt: "asc" }), { createdAt: "asc" });
  assert.deepEqual(sanitizeAiOrderBy({ name: "DESC" }), { name: "desc" });
});

test("SEC-07: FFmpeg inputUrl rejects control / NUL characters", () => {
  assert.throws(() => sanitizeFfmpegInputUrl("http://x/\0evil"), /Invalid stream source/);
  assert.throws(() => sanitizeFfmpegInputUrl("http://x/\n-f\nlavfi"), /Invalid stream source/);
  assert.throws(
    () =>
      buildFfmpegArgv({
        ffmpegPath: "/usr/bin/ffmpeg",
        inputUrl: "http://evil\x1b[31m",
        streamId: "s1",
        serverId: "srv1",
      }),
    /Invalid stream source/
  );
  const ok = buildFfmpegArgv({
    ffmpegPath: "/usr/bin/ffmpeg",
    inputUrl: "http://cdn.example/live.ts",
    streamId: "s1",
    serverId: "srv1",
  });
  assert.ok(ok.args.includes("http://cdn.example/live.ts"));
});

test("SEC-09/10: password hashing uses bcrypt cost 12; reseller PATCH omits role/credits", async () => {
  const hash = await hashPassword("AuditPass1!");
  assert.match(hash, /^\$2[aby]\$12\$/);
  const src = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/reseller/users/route.ts"),
    "utf8"
  );
  const patchStart = src.indexOf("export async function PATCH");
  const patchEnd = src.indexOf("export async function DELETE", patchStart);
  const patch = src.slice(patchStart, patchEnd);
  assert.equal(/\brole\s*:/.test(patch), false);
  assert.equal(/\bcredits\s*:/.test(patch), false);
  assert.equal(/\bparentId\s*:/.test(patch), false);
});
