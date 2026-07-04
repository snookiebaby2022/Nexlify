"use client";

import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function NginxCacheSettingsPage() {
  return (
    <SettingsPanelForm
      group="nginx-cache"
      title="Nginx Cache Boost"
      description="Proxy cache for HLS/VOD segments at the nginx level. Reduces upstream load and improves delivery for popular content."
      sections={[
        {
          title: "Cache storage",
          info: "Cache files are stored on disk. Ensure the cache path exists and has enough space. Use a fast SSD for best performance.",
          fields: [
            { key: "enabled", label: "Enable nginx cache", type: "yesno", hint: "Turn on proxy_cache for HLS/VOD upstreams." },
            { key: "cachePath", label: "Cache path", type: "text", placeholder: "/var/cache/nexlify/hls", hint: "Directory where nginx writes cached segments." },
            { key: "cacheSize", label: "Max cache size", type: "text", placeholder: "1g", hint: "Total disk allocation for cache (e.g. 1g, 500m)." },
            { key: "cacheLevels", label: "Cache levels", type: "text", placeholder: "1:2", hint: "Nginx cache directory hashing levels." },
          ],
        },
        {
          title: "Cache zone",
          info: "The shared memory zone stores cache metadata. Increase keysZoneSize if you have thousands of channels.",
          fields: [
            { key: "keysZoneName", label: "Zone name", type: "text", placeholder: "hls_cache", hint: "Name of the nginx proxy_cache zone." },
            { key: "keysZoneSize", label: "Zone size", type: "text", placeholder: "10m", hint: "Shared memory for cache keys (10m ≈ 80k keys)." },
            { key: "inactiveMinutes", label: "Inactive expiry (minutes)", type: "number", hint: "Remove cached items not accessed after this time." },
            { key: "maxTempFiles", label: "Max temp files", type: "number", hint: "Set to 0 to disable temp file writes (cache on completion only)." },
          ],
        },
        {
          title: "Cache behaviour",
          fields: [
            { key: "useStale", label: "Use stale cache on error", type: "yesno", hint: "Serve stale content when upstream is unavailable." },
            { key: "revalidate", label: "Revalidate stale content", type: "yesno", hint: "Send If-Modified-Since to upstream for stale items." },
            { key: "cacheValidOk", label: "Cache valid (200 OK)", type: "text", placeholder: "200", hint: "Cache responses with these status codes." },
            { key: "cacheValidNotFound", label: "Cache valid (404)", type: "text", placeholder: "1m", hint: "Cache 404 responses for this duration." },
            { key: "cacheBypassHeader", label: "Bypass header", type: "text", placeholder: "Authorization", hint: "Skip cache when this header is present." },
          ],
        },
        {
          title: "Response headers",
          fields: [
            { key: "proxyHideHeader", label: "Hide header", type: "text", placeholder: "Set-Cookie", hint: "Strip this header from upstream responses before caching." },
            { key: "proxyHideHeader2", label: "Hide header 2", type: "text", placeholder: "X-Powered-By", hint: "Additional header to strip." },
          ],
        },
        {
          title: "Byte-range slicing",
          info: "Slicing allows nginx to serve partial content (byte ranges) without downloading the entire file first. Essential for large VOD files.",
          fields: [
            { key: "sliceEnabled", label: "Enable byte-range slicing", type: "yesno", hint: "Recommended for VOD. Requires nginx slice module." },
            { key: "sliceSize", label: "Slice size", type: "text", placeholder: "1m", hint: "Size of each byte-range slice (1m is standard)." },
          ],
        },
        { title: "Notes", fields: [{ key: "notes", label: "Notes", type: "textarea", colSpan: 2 }] },
      ]}
    />
  );
}
