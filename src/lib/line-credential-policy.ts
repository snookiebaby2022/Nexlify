import { getSettingGroup } from "@/lib/panel-settings";
import {
  clampLineCredentialMinLength,
  type LinePasswordPolicy,
} from "@/lib/credential-generate";

export async function resolveLineCredentialMinLength(): Promise<number> {
  const security = await getSettingGroup("security");
  return clampLineCredentialMinLength(security.lineCredentialMinLength);
}

export async function resolveLinePasswordPolicy(): Promise<LinePasswordPolicy> {
  const security = await getSettingGroup("security");
  return {
    minLength: clampLineCredentialMinLength(security.lineCredentialMinLength),
    requireLetterAndDigit: security.linePasswordRequireLetterAndDigit === true,
    blockCommonPasswords: security.linePasswordBlockCommon !== false,
    disallowUsernameMatch: security.linePasswordDisallowUsername !== false,
  };
}
