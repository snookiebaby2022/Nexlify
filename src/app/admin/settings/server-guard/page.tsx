import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function ServerGuardSettingsPage() {
  return (
    <SettingsPanelForm
      group="server-guard"
      title="Server Guard Security"
      description="Unified protection against playlist probing, brute-force attacks, Layer 7 DDoS, and resource exhaustion."
      sections={[
        {
          title: "General",
          fields: [
            { key: "serverGuardEnabled", label: "Enable Server Guard", type: "yesno", hint: "Master switch for all Server Guard protections." },
            { key: "guardAutoBlockMinutes", label: "Auto-block duration (minutes)", type: "number", placeholder: "15", hint: "How long to block offending IPs." },
            { key: "guardMaxConnectionsPerIp", label: "Max connections per IP", type: "number", placeholder: "300", hint: "Connection limit before triggering DDoS protection." },
          ],
        },
        {
          title: "Protections",
          fields: [
            { key: "guardPlaylistProbing", label: "Block playlist probing", type: "yesno", hint: "Prevent unauthorized playlist scraping." },
            { key: "guardBruteForce", label: "Block brute-force attacks", type: "yesno", hint: "Rate-limit login and credential attempts." },
            { key: "guardDdosLayer7", label: "Layer 7 DDoS protection", type: "yesno", hint: "HTTP-level DDoS mitigation." },
            { key: "guardResourceExhaustion", label: "Resource exhaustion protection", type: "yesno", hint: "Auto-throttle when CPU/RAM thresholds are hit." },
          ],
        },
        {
          title: "Thresholds",
          fields: [
            { key: "guardCpuThreshold", label: "CPU threshold (%)", type: "number", placeholder: "85", hint: "Trigger cooldown when CPU exceeds this." },
            { key: "guardRamThreshold", label: "RAM threshold (%)", type: "number", placeholder: "90", hint: "Trigger cooldown when RAM exceeds this." },
            { key: "guardCooldownSeconds", label: "Cooldown duration (seconds)", type: "number", placeholder: "60", hint: "How long to throttle connections." },
          ],
        },
        {
          title: "Notifications",
          fields: [
            { key: "guardNotifyTelegram", label: "Notify via Telegram", type: "yesno", hint: "Send alerts to configured Telegram bot." },
            { key: "guardNotifyEmail", label: "Notify via Email", type: "yesno", hint: "Send alerts to configured email address." },
          ],
        },
      ]}
    />
  );
}
