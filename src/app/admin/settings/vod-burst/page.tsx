"use client";

import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function VodBurstSettingsPage() {
  return (
    <SettingsPanelForm
      group="vod-burst"
      title="VOD Burst Speed"
      description="Control how fast VOD segments are delivered to clients. Configure buffer sizes and rate limits for optimal VOD playback performance."
      sections={[
        {
          title: "Burst settings",
          info: "Burst allows the server to temporarily exceed the normal transfer rate to fill the client buffer faster. This improves initial playback start time.",
          fields: [
            { key: "enabled", label: "Enable VOD burst", type: "yesno", hint: "Allow burst speed for VOD content delivery." },
            { key: "burstSizeKb", label: "Burst size (KB)", type: "number", hint: "Amount of data to burst in KB (e.g. 512). Set to 0 for unlimited burst." },
            { key: "burstRateKbps", label: "Burst rate limit (Kbps)", type: "number", hint: "Maximum burst transfer rate in Kbps. 0 = no limit." },
          ],
        },
        {
          title: "Buffer configuration",
          fields: [
            { key: "bufferCount", label: "Buffer count", type: "number", hint: "Number of proxy buffers (4–8 typical)." },
            { key: "bufferSize", label: "Buffer size", type: "text", placeholder: "256k", hint: "Size of each proxy buffer (e.g. 256k, 512k)." },
            { key: "maxBufferSize", label: "Max buffer size", type: "text", placeholder: "4m", hint: "Maximum total buffer memory per connection (e.g. 4m)." },
          ],
        },
        {
          title: "Proxy buffering",
          fields: [
            { key: "proxyBuffering", label: "Enable proxy buffering", type: "yesno", hint: "Buffer upstream responses before sending to client. Recommended for VOD." },
            { key: "proxyBufferSize", label: "Proxy buffer size", type: "text", placeholder: "8k", hint: "Size of the initial proxy buffer for reading upstream response headers." },
            { key: "proxyBusyBuffersSize", label: "Busy buffers size", type: "text", placeholder: "16k", hint: "Max data to send to client while upstream is still buffering." },
          ],
        },
        { title: "Notes", fields: [{ key: "notes", label: "Notes", type: "textarea", colSpan: 2 }] },
      ]}
    />
  );
}
