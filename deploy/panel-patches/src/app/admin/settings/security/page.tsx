import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function SecuritySettingsPage() {
  return (
    <SettingsPanelForm
      group="security"
      title="Security"
      description="Authentication, bot stealth, and rate limiting. Sync Cloudflare & Bunny IPs under Security → Cloudflare & Bunny IPs."
      sections={[
        {
          title: "Access",
          fields: [
            { key: "forceHttps", label: "Force HTTPS", type: "yesno" },
            { key: "sessionDays", label: "Session length (days)", type: "number" },
            {
              key: "logoutOnIpChange",
              label: "Logout on IP change",
              type: "yesno",
              hint: "Ends the session if the client IP changes (uses X-Forwarded-For behind nginx).",
            },
            {
              key: "ipWhitelist",
              label: "Admin IP whitelist",
              type: "textarea",
              colSpan: 2,
              hint: "One IP per line. Leave empty to allow all.",
            },
          ],
        },
        {
          title: "Login protection",
          fields: [
            { key: "maxLoginAttempts", label: "Max login attempts", type: "number" },
            { key: "lockoutMinutes", label: "Lockout minutes", type: "number" },
            {
              key: "loginFloodPerMin",
              label: "Login flood limit (per IP / minute)",
              type: "number",
              hint: "0 = disabled. Blocks burst login attempts before lockout.",
            },
            { key: "requireStrongPasswords", label: "Require strong passwords", type: "yesno" },
            { key: "apiRateLimitPerMin", label: "API rate limit per minute", type: "number" },
          ],
        },
        {
          title: "Line credentials",
          info: "Applies when creating subscription lines (Add Line). Empty fields auto-fill when enabled.",
          fields: [
            {
              key: "autoGenerateLineCredentials",
              label: "Auto-generate username & password",
              type: "yesno",
            },
            {
              key: "lineCredentialMinLength",
              label: "Minimum username/password length",
              type: "number",
              hint: "Minimum 6. Used for validation on create.",
            },
          ],
        },
        {
          title: "Two-factor (TOTP)",
          info: "Admins enable 2FA on Profile. When enabled, login requires a 6-digit code from an authenticator app.",
          fields: [
            {
              key: "totpRequiredForAdmins",
              label: "Require 2FA for new admin logins",
              type: "yesno",
              hint: "Existing admins must enable 2FA on Profile before this fully applies.",
            },
          ],
        },
        {
          title: "CDN proxy IPs",
          info: "Sync Cloudflare and Bunny edge IP lists under Settings → CDN IPs. Used for real client IP behind CDN.",
          fields: [
            {
              key: "trustCloudflareIp",
              label: "Trust Cloudflare (CF-Connecting-IP)",
              type: "yesno",
            },
            {
              key: "trustBunnyIp",
              label: "Trust Bunny CDN forwarded IP",
              type: "yesno",
            },
          ],
        },
        {
          title: "Bot stealth",
          info: "Hides admin, login, and reseller areas from crawlers. Returns a plain 404 and sends noindex headers. Xtream/player APIs stay reachable.",
          fields: [
            { key: "blockBots", label: "Block bots on panel pages", type: "yesno" },
            { key: "stealthPanel", label: "Stealth headers (noindex, no referrer)", type: "yesno" },
          ],
        },
      ]}
    />
  );
}
