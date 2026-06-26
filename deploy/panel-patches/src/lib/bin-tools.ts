import { spawn } from "child_process";
import { access } from "fs/promises";
import { constants } from "fs";
import { getSettingGroup } from "@/lib/panel-settings";
import { getBinPaths } from "@/lib/bin-paths";
import { resolveActivePath } from "@/lib/bin-version-catalog";
import type { BinVersionOption } from "@/lib/bin-version-types";

async function binariesSettings() {
  return getSettingGroup("binaries");
}

export async function getFfmpegPath(): Promise<string> {
  const paths = await getBinPaths();
  const settings = await binariesSettings();
  const versions = settings.ffmpegVersions as BinVersionOption[] | undefined;
  return resolveActivePath(versions, String(settings.activeFfmpegId ?? ""), paths.ffmpegPath);
}

export async function getPhpPath(): Promise<string> {
  const paths = await getBinPaths();
  const settings = await binariesSettings();
  const versions = settings.phpVersions as BinVersionOption[] | undefined;
  return resolveActivePath(versions, String(settings.activePhpId ?? ""), paths.phpPath);
}

export async function getFfprobePath(): Promise<string> {
  const ffmpeg = await getFfmpegPath();
  if (/ffmpeg$/i.test(ffmpeg)) return ffmpeg.replace(/ffmpeg$/i, "ffprobe");
  return "ffprobe";
}

export async function binExists(binPath: string): Promise<boolean> {
  try {
    await access(binPath.trim(), constants.X_OK);
    return true;
  } catch {
    try {
      await access(binPath.trim(), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

export function runCommand(
  command: string,
  args: string[],
  timeoutMs = 30_000
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out: ${command}`));
    }, timeoutMs);

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

/** Stalker-style ffmpeg relay token using configured binary name. */
export async function stalkerFfmpegCmd(streamId: string): Promise<string> {
  const paths = await getBinPaths();
  const bin = paths.ffmpegPath.split(/[/\\]/).pop() ?? "ffmpeg";
  return `${bin} ${streamId}`;
}
