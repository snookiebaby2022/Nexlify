import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function VodProxySettingsPage() {
  return (
    <SettingsPanelForm
      group="vod-proxy"
      title="Hide VOD Source URL"
      description="Proxy VOD and series through your server to hide original provider URLs from end users."
      sections={[
        {
          title: "General",
          fields: [
            { key: "vodProxyEnabled", label: "Enable VOD proxy", type: "yesno", hint: "Proxy all VOD requests through your server." },
            { key: "vodProxyThroughPanel", label: "Proxy through panel", type: "yesno", hint: "Route VOD through the panel server instead of direct." },
            { key: "vodProxyMaxFileSize", label: "Max file size (MB)", type: "number", placeholder: "2048", hint: "Maximum VOD file size to proxy." },
          ],
        },
        {
          title: "Caching",
          fields: [
            { key: "vodProxyCacheEnabled", label: "Enable proxy cache", type: "yesno", hint: "Cache proxied VOD responses." },
            { key: "vodProxyCacheTtlHours", label: "Cache TTL (hours)", type: "number", placeholder: "24", hint: "How long to keep cached VOD data." },
          ],
        },
        {
          title: "Security",
          fields: [
            { key: "vodProxyLogAccess", label: "Log access", type: "yesno", hint: "Log all VOD proxy requests." },
            { key: "vodProxyStripReferer", label: "Strip referer", type: "yesno", hint: "Remove referer header from upstream requests." },
            { key: "vodProxyUserAgent", label: "Proxy user-agent", type: "text", placeholder: "Nexlify/1.0", hint: "User-agent sent to upstream servers." },
          ],
        },
      ]}
    />
  );
}
