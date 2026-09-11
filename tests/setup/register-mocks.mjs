/**
 * Default external-call mocks for the test suite.
 * Loaded via: tsx --import ./tests/setup/load-env.mjs --import ./tests/setup/register-mocks.mjs
 */
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { mock } from "node:test";

const require = createRequire(import.meta.url);

function ensureMockState() {
  globalThis.__nexlifyTestMocks = globalThis.__nexlifyTestMocks || {
    ffmpegSpawns: 0,
    fetchCalls: 0,
    smtpTransports: 0,
    smtpMails: 0,
    payments: [],
  };
  return globalThis.__nexlifyTestMocks;
}

function fakeChild(exitCode = 0) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  child.pid = 424242;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    child.emit("close", exitCode);
    return true;
  };
  queueMicrotask(() => {
    child.stdout.emit("data", Buffer.from(""));
    child.emit("close", exitCode);
  });
  return child;
}

if (process.env.NEXLIFY_TEST_MOCKS !== "0") {
  ensureMockState();
  const cp = require("node:child_process");

  mock.method(cp, "spawn", () => {
    ensureMockState().ffmpegSpawns += 1;
    return fakeChild(0);
  });

  mock.method(cp, "execFile", (_file, _args, options, callback) => {
    ensureMockState().ffmpegSpawns += 1;
    const cb = typeof options === "function" ? options : callback;
    if (typeof cb === "function") queueMicrotask(() => cb(null, "", ""));
    return fakeChild(0);
  });

  if (process.env.NEXLIFY_TEST_ALLOW_NET !== "1" && typeof globalThis.fetch === "function") {
    const realFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init) => {
      ensureMockState().fetchCalls += 1;
      const url = String(typeof input === "string" ? input : input?.url ?? "");
      if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\b/i.test(url)) {
        return realFetch(input, init);
      }
      return new Response(JSON.stringify({ mocked: true, url }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
  }

  try {
    const nodemailer = require("nodemailer");
    mock.method(nodemailer, "createTransport", () => {
      ensureMockState().smtpTransports += 1;
      return {
        sendMail: async (opts) => {
          ensureMockState().smtpMails += 1;
          return {
            messageId: "test-message-id",
            accepted: [opts?.to].flat().filter(Boolean),
            rejected: [],
          };
        },
        verify: async () => true,
        close: () => undefined,
      };
    });
  } catch {
    /* optional */
  }
}
