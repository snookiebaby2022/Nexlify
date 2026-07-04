"use client";

import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function Ip2ProxySettingsPage() {
  return (
    <SettingsPanelForm
      group="ip2proxy"
      title="IP2Proxy Integration"
      description="Detect and block VPN, datacenter, proxy, and Tor exit node IPs using the IP2Proxy database. Complements MaxMind geo-blocking for enhanced fraud prevention."
      sections={[
        {
          title: "Database",
          info: "Download the BIN database from ip2proxy.com (free tier available). Place the .bin file on the panel server and enter the path below.",
          fields: [
            { key: "enabled", label: "Enable IP2Proxy detection", type: "yesno", hint: "Activate IP2Proxy lookups for incoming connections." },
            { key: "databasePath", label: "Database path (.bin)", type: "text", placeholder: "/usr/local/share/ip2proxy/ip2proxy_ip.bin", hint: "Absolute path to the IP2Proxy BIN database file." },
          ],
        },
        {
          title: "Actions on detection",
          info: "Choose what happens when an IP is identified as VPN, datacenter, proxy, or Tor.",
          fields: [
            { key: "blockVpn", label: "Block VPN IPs", type: "yesno", hint: "Reject connections from known VPN endpoints." },
            { key: "blockDatacenter", label: "Block datacenter IPs", type: "yesno", hint: "Reject connections from cloud/datacenter ranges (AWS, GCP, etc.)." },
            { key: "blockProxy", label: "Block proxy IPs", type: "yesno", hint: "Reject connections from HTTP/SOCKS proxy servers." },
            { key: "blockTor", label: "Block Tor exit nodes", type: "yesno", hint: "Reject connections from Tor network exit nodes." },
            {
              key: "actionOnDetection",
              label: "Default action",
              type: "select",
              options: [
                { value: "log", label: "Log only (no block)" },
                { value: "block", label: "Block connection" },
                { value: "flag", label: "Flag in abuse log" },
              ],
              hint: "Override per-type actions above. 'Log only' is useful for monitoring before enforcement.",
            },
          ],
        },
        {
          title: "Logging",
          fields: [
            { key: "logDetection", label: "Log detection results", type: "yesno", hint: "Record IP2Proxy lookup results for audit." },
          ],
        },
        { title: "Notes", fields: [{ key: "notes", label: "Notes", type: "textarea", colSpan: 2 }] },
      ]}
    />
  );
}
