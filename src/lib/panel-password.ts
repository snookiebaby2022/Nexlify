import { getSettingGroup } from "@/lib/panel-settings";

const PANEL_PASSWORD_MIN = 8;

export async function validatePanelPasswordChange(password: string): Promise<string | null> {
  const p = String(password ?? "").trim();
  if (!p) return "New password is required";
  if (p.length < PANEL_PASSWORD_MIN) {
    return `Password must be at least ${PANEL_PASSWORD_MIN} characters`;
  }

  const security = await getSettingGroup("security");
  if (security.requireStrongPasswords) {
    if (p.length < 10) return "Strong passwords must be at least 10 characters";
    if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/[0-9]/.test(p)) {
      return "Strong passwords must include upper, lower, and a number";
    }
  }

  return null;
}
