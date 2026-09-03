import { PanelRole } from "@prisma/client";
import { getSettingGroup } from "@/lib/panel-settings";
import {
  generateLinePassword,
  generateLineUsername,
  validatePanelAccountCredentials,
} from "@/lib/credential-generate";
import { resolveLineCredentialMinLength } from "@/lib/line-credential-policy";

export async function resellerCredentialsMustBeGenerated(): Promise<boolean> {
  const security = await getSettingGroup("security");
  return security.autoGenerateResellerCredentials === true;
}

/**
 * Resellers / sub-resellers: when the admin setting is on, empty username/password
 * are generated. When off, both must be typed. Admin accounts are never auto-filled.
 */
export async function resolveNewPanelUserCredentials(input: {
  role: PanelRole;
  username: string;
  password: string;
}): Promise<{ ok: true; username: string; password: string } | { ok: false; error: string }> {
  let username = String(input.username ?? "").trim();
  let password = String(input.password ?? "").trim();
  const isResellerAccount =
    input.role === PanelRole.RESELLER || input.role === PanelRole.SUB_RESELLER;

  if (isResellerAccount) {
    if (!username) username = generateLineUsername();
    if (!password) password = generateLinePassword();
  } else if (input.role === PanelRole.ADMIN && !password && username) {
    password = generateLinePassword();
  }

  if (!username || !password) {
    return { ok: false, error: "Username and password are required" };
  }

  const credErr = validatePanelAccountCredentials(username, password, await resolveLineCredentialMinLength());
  if (credErr) return { ok: false, error: credErr };
  return { ok: true, username, password };
}
