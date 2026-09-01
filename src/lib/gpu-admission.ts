import { getSettingGroup } from "@/lib/panel-settings";

export type GpuAdmissionState = {
  maxSessions: number;
  activeSessions: number;
  memoryMbCap: number;
  memoryMbUsed: number;
};

const DEFAULT_MAX_SESSIONS = Number(process.env.NEXLIFY_GPU_MAX_SESSIONS || 8);
const DEFAULT_MEMORY_MB = Number(process.env.NEXLIFY_GPU_MEMORY_MB || 4096);
const SESSION_MEMORY_MB = Number(process.env.NEXLIFY_GPU_SESSION_MEMORY_MB || 512);

/** In-process GPU slot tracker — dedicated transcode nodes should set env caps. */
let activeGpuSessions = 0;
let activeGpuMemoryMb = 0;

export function resetGpuAdmissionForTests(): void {
  activeGpuSessions = 0;
  activeGpuMemoryMb = 0;
}

export async function getGpuAdmissionLimits(): Promise<GpuAdmissionState> {
  const settings = await getSettingGroup("streams");
  const maxSessions = Number(settings.gpuMaxSessions ?? DEFAULT_MAX_SESSIONS);
  const memoryMbCap = Number(settings.gpuMemoryMbCap ?? DEFAULT_MEMORY_MB);
  return {
    maxSessions,
    activeSessions: activeGpuSessions,
    memoryMbCap,
    memoryMbUsed: activeGpuMemoryMb,
  };
}

export async function admitGpuTranscodeSession(opts?: {
  memoryMb?: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const limits = await getGpuAdmissionLimits();
  const needMb = Math.max(SESSION_MEMORY_MB, opts?.memoryMb ?? SESSION_MEMORY_MB);
  if (limits.activeSessions >= limits.maxSessions) {
    return { ok: false, reason: "GPU session cap reached" };
  }
  if (limits.memoryMbUsed + needMb > limits.memoryMbCap) {
    return { ok: false, reason: "GPU memory cap reached" };
  }
  activeGpuSessions += 1;
  activeGpuMemoryMb += needMb;
  return { ok: true };
}

export function releaseGpuTranscodeSession(memoryMb = SESSION_MEMORY_MB): void {
  activeGpuSessions = Math.max(0, activeGpuSessions - 1);
  activeGpuMemoryMb = Math.max(0, activeGpuMemoryMb - memoryMb);
}

/** Reject GPU transcode when admission fails; callers should fall back to CPU or relay. */
export async function shouldUseGpuTranscode(profileGpuEncoder: string): Promise<boolean> {
  if (!profileGpuEncoder || profileGpuEncoder === "cpu") return false;
  const admission = await admitGpuTranscodeSession();
  if (!admission.ok) return false;
  return true;
}
