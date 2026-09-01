import assert from "node:assert/strict";
import test from "node:test";
import {
  admitGpuTranscodeSession,
  releaseGpuTranscodeSession,
  resetGpuAdmissionForTests,
} from "./gpu-admission";

test("gpu admission rejects when session cap reached", async () => {
  resetGpuAdmissionForTests();
  process.env.NEXLIFY_GPU_MAX_SESSIONS = "1";
  const first = await admitGpuTranscodeSession();
  assert.equal(first.ok, true);
  const second = await admitGpuTranscodeSession();
  assert.equal(second.ok, false);
  releaseGpuTranscodeSession();
  delete process.env.NEXLIFY_GPU_MAX_SESSIONS;
});
