import { SettingsPanelForm } from "@/components/settings-panel-form";
import { AutoLogosButton } from "@/components/auto-logos-button";

export default function StreamSettingsPage() {
  return (
    <SettingsPanelForm
      group="streams"
      title="Streaming settings"
      description="Playback, export, load balancing, and connection handling."
      sections={[
        {
          title: "Export & content",
          info: "Controls what subscribers see in M3U playlists and the Xtream API. Disabled streams and bouquets stay in the panel but can be hidden from clients.",
          fields: [
            {
              key: "excludeDisabledFromExport",
              label: "Exclude disabled content from export",
              type: "yesno",
            },
            {
              key: "allowRestream",
              label: "Allow restream",
              type: "yesno",
              hint: "When off, created channels cannot play and new restream channels cannot be added.",
            },
            { key: "vodDirectPlay", label: "VOD direct play", type: "yesno" },
            { key: "epgHoursAhead", label: "EPG hours ahead", type: "number" },
            {
              key: "autoChannelLogos",
              label: "Auto-fetch channel logos",
              type: "yesno",
              hint: "When enabled, new live streams without an icon get a logo from TMDB TV search or public logo URLs.",
            },
            {
              key: "autoChannelLogoSource",
              label: "Logo source",
              type: "select",
              options: [
                { value: "tmdb", label: "TMDB TV only" },
                { value: "tmdb_then_slug", label: "TMDB TV, then logo CDN fallback" },
                { value: "slug", label: "Logo CDN by channel name only" },
              ],
            },
          ],
        },
        {
          title: "Connections & limits",
          fields: [
            { key: "defaultStreamTimeout", label: "Stream timeout (seconds)", type: "number" },
            { key: "maxConnectionsPerLine", label: "Max connections per line", type: "number" },
            {
              key: "connectionLimitHandle",
              label: "Connection limit handle",
              type: "select",
              options: [
                { value: "validate_on_connect", label: "Validate connections count on connect" },
                { value: "close_oldest", label: "Close oldest connection" },
                { value: "reject", label: "Reject new connection" },
              ],
            },
            {
              key: "vodConnectionHandle",
              label: "VOD connection handle",
              type: "select",
              options: [
                { value: "30m_expire", label: "30 minutes expire" },
                { value: "1h_expire", label: "1 hour expire" },
                { value: "until_complete", label: "Until complete" },
              ],
            },
          ],
        },
        {
          title: "Load balancing",
          fields: [
            {
              key: "loadBalancing",
              label: "Load balancing",
              type: "select",
              options: [
                { value: "server_slots", label: "Server slots available" },
                { value: "round_robin", label: "Round robin" },
                { value: "least_connections", label: "Least connections" },
              ],
            },
            {
              key: "geoLoadBalancing",
              label: "Geo-aware load balancing",
              type: "yesno",
              hint: "Route playback to servers matching client country/ISP (configure per server under Manage Servers).",
            },
            {
              key: "loadBalancingRestriction",
              label: "Load balancing connection restriction",
              type: "select",
              options: [
                { value: "stop_overloaded", label: "Stop client if server is overloaded" },
                { value: "allow_queue", label: "Allow queue" },
                { value: "failover", label: "Failover to next server" },
              ],
            },
            {
              key: "streamConnectionsOnRestart",
              label: "Stream connections on restart",
              type: "select",
              options: [
                { value: "keep", label: "Don't close connections when stream restarts" },
                { value: "close", label: "Close all connections" },
              ],
            },
          ],
        },
        {
          title: "Nginx buffer",
          description: "Stored for edge/nginx integration. Rebuild vars on the stream server when changed.",
          info: "Buffer count is the number of buffers; size is per buffer (e.g. 32k). Enable for high-bitrate live or VOD edge caching.",
          fields: [
            { key: "nginxBufferLive", label: "Nginx buffer (Live)", type: "yesno" },
            { key: "nginxBufferVod", label: "Nginx buffer (VOD)", type: "yesno" },
            { key: "nginxRestreamUseBuffer", label: "Restreamers use nginx buffer", type: "yesno" },
            { key: "nginxBufferCountLive", label: "Nginx buffer count (Live)", type: "number" },
            { key: "nginxBufferCountVod", label: "Nginx buffer count (VOD)", type: "number" },
            { key: "nginxBufferSizeLive", label: "Nginx buffer size (Live)", type: "text", placeholder: "32k" },
            { key: "nginxBufferSizeVod", label: "Nginx buffer size (VOD)", type: "text", placeholder: "32k" },
          ],
        },
        {
          title: "Anti-Freeze & fast zapping",
          description:
            "Low-latency live playback and sub-second channel changes. Anti-Freeze disables nginx live buffering on edge agents; Fast Zap caches resolved URLs and pre-warms neighbouring channels.",
          info: "Enabled by default. Increase cache TTL (60–90s) for faster zapping on large bouquets; lower HLS segment duration in Anti-buffer section for even less freeze risk.",
          fields: [
            {
              key: "antiFreezeEnabled",
              label: "Anti-Freeze technology",
              type: "yesno",
              hint: "Forces proxy_buffering off on live edges and shortens HLS segments.",
            },
            {
              key: "fastZapEnabled",
              label: "Fast zapping",
              type: "yesno",
              hint: "Redis-backed playback URL cache + neighbour prefetch on channel play.",
            },
            {
              key: "playbackUrlCacheTtlSec",
              label: "Playback URL cache TTL (seconds)",
              type: "number",
              hint: "45–90 typical. Higher = faster zaps; invalidate on stream URL change.",
            },
            {
              key: "zapPrefetchNeighbors",
              label: "Prefetch adjacent channels",
              type: "number",
              hint: "0–8 channels each side warmed in the background when a stream plays.",
            },
            { key: "zapPrefetchOnLiveHit", label: "Prefetch on channel play", type: "yesno" },
            {
              key: "zapPrefetchOnPlaylist",
              label: "Warm first channels on playlist load",
              type: "yesno",
              hint: "Optional — warms the first 5 live streams when clients call get_live_streams.",
            },
          ],
        },
        {
          title: "On-demand probing",
          description: "FFmpeg probesize for live channels imported or created as on-demand.",
          info: "128000 bytes (128 KB) is the recommended default for most IPTV sources — enough to detect codecs without long startup delay. Disable auto to set a custom value.",
          fields: [
            {
              key: "onDemandProbesizeAuto",
              label: "Auto probesize on-demand",
              type: "yesno",
              hint: "When enabled, new on-demand streams use the recommended probesize below.",
            },
            {
              key: "onDemandProbesize",
              label: "Probesize on-demand (bytes)",
              type: "text",
              placeholder: "128000",
              hint: "Typical range: 32768–512000. Lower = faster zapping, higher = better codec detection.",
            },
          ],
        },
        {
          title: "Anti-buffer / performance",
          description: "Edge and transcoder tuning hints for stream servers. Saving queues apply_config on all agents. Env: STREAM_PROBE_TIMEOUT_MS, PLAYBACK_RATE_LIMIT_PER_MIN (see docs/OPS.md).",
          info: "Defaults match typical XUI-style VPS setups. Set max connections or thread count to 0 to leave unlimited / auto.",
          fields: [
            { key: "hlsSegmentDuration", label: "HLS segment duration (seconds)", type: "number", hint: "Lower = less latency, more requests. 4–6s is common for live." },
            { key: "segmentLength", label: "Segment length (seconds)", type: "number", hint: "Recording / archive segment size on the stream server." },
            { key: "bufferSize", label: "Buffer size", type: "text", placeholder: "512k", hint: "Per-connection read buffer (nginx proxy_buffer_size)." },
            { key: "readTimeout", label: "Read timeout (seconds)", type: "number", hint: "Upstream read timeout before retry or failover." },
            { key: "connectionTimeout", label: "Connection timeout (seconds)", type: "number", hint: "Time to establish upstream TCP connect." },
            { key: "maxConnectionsPerStream", label: "Max connections per stream", type: "number", hint: "0 = unlimited. Cap hot channels on small VPS." },
            { key: "ffmpegThreadCount", label: "FFmpeg thread count", type: "number", hint: "0 = auto. Set to vCPU count on transcode nodes." },
            { key: "transcodePreset", label: "Transcode preset", type: "select", options: [
              { value: "ultrafast", label: "ultrafast (lowest CPU)" },
              { value: "veryfast", label: "veryfast (recommended live)" },
              { value: "fast", label: "fast" },
              { value: "medium", label: "medium (VOD quality)" },
            ], hint: "x264 preset for live transcodes — veryfast balances lag vs CPU." },
            {
              key: "defaultFfmpegProfile",
              label: "Default FFmpeg transcode profile",
              type: "select",
              options: [
                { value: "copy", label: "Direct copy (no transcode)" },
                { value: "1080p-hq", label: "1080p HQ (~8 Mbps)" },
                { value: "720p", label: "720p (~4 Mbps)" },
                { value: "480p", label: "480p (~2 Mbps)" },
                { value: "360p-mobile", label: "360p mobile (~1 Mbps)" },
              ],
              hint: "Adaptive profiles for new live streams and agent transcodes. Use stream bitrates JSON for multi-bitrate ABR.",
            },
            { key: "antiBufferNotes", label: "Notes", type: "textarea", colSpan: 3 },
          ],
        },
        {
          title: "ABR & playback tokens",
          info: "ABR auto-switch exposes abr_auto_switch in Xtream server_info for compatible clients. Token TTL adds expiring pt= params when > 0.",
          fields: [
            { key: "abrAutoSwitch", label: "Adaptive bitrate auto-switch hints", type: "yesno" },
            {
              key: "playbackTokenTtlSec",
              label: "Playback URL token TTL (seconds)",
              type: "number",
              hint: "0 = disabled. Signed pt= token on playback URLs.",
            },
            { key: "autoFixDeadLinks", label: "Auto-fix dead links (cron probe)", type: "yesno" },
            {
              key: "autoFixDeadLinksIntervalMin",
              label: "Probe interval (minutes)",
              type: "number",
            },
          ],
        },
      ]}
      footerExtra={<AutoLogosButton />}
    />
  );
}
