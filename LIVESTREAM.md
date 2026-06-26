# Live stream at https://nexlify.live/livestream

Drop-in files live under `marketing-drop-in/`. Copy them into the marketing site at `/var/www/nexlify` (or sync via your usual deploy script), then rebuild `nexlify-web`.

## URLs

| URL | Purpose |
|-----|---------|
| https://nexlify.live/livestream | Public viewer page + OBS setup |
| https://nexlify.live/hls/nexlify.m3u8 | HLS manifest (after RTMP ingest is running) |
| rtmp://nexlify.live:1935/live | OBS RTMP server |

## Environment (`/var/www/nexlify/.env`)

```env
NEXT_PUBLIC_LIVESTREAM_HLS_URL=https://nexlify.live/hls/nexlify.m3u8
LIVESTREAM_RTMP_SERVER=rtmp://nexlify.live/live
LIVESTREAM_STREAM_KEY=your-secret-stream-key
LIVESTREAM_TITLE=Nexlify Live
```

See `ENV_MARKETING.example.txt` for all optional keys.

## VPS setup (one time)

**Do not** paste `include /etc/nginx/nexlify.live-rtmp-hls.conf` into nginx.conf by hand unless RTMP is installed — standard nginx will fail with `unknown directive "rtmp"`.

Run the installer on the VPS (after syncing the panel repo):

```bash
# Fix nginx if it is already broken:
sudo bash /home/nexlify-panel/scripts/install-livestream-rtmp.sh --recover-only

# Install RTMP + HLS directory (auto: apt module, else standalone nginx on :1935):
sudo bash /home/nexlify-panel/scripts/install-livestream-rtmp.sh
```

The installer:
1. Removes the broken RTMP include from main `nginx.conf` if needed
2. Creates `/var/www/nexlify-hls`
3. Installs `libnginx-mod-rtmp` **or** builds a separate `nexlify-rtmp` service on port 1935
4. Ensures `/hls/` is served by the main nexlify.live vhost (from `nginx/nexlify.live.conf`)

## OBS Studio

1. **Settings → Stream** — Service: **Custom**
2. **Server:** `rtmp://nexlify.live/live` (or value of `LIVESTREAM_RTMP_SERVER`)
3. **Stream key:** same as `LIVESTREAM_STREAM_KEY`
4. **Start Streaming** — the `/livestream` page polls every 15s and starts HLS playback when the manifest has segments.

Recommended output: 1280×720 or 1920×1080, 2500–6000 kbps, keyframe interval **1** (must match HLS segment size).

## Reduce delay (OBS → website)

HLS always adds some delay (typically **5–20 seconds**). Your stack is:

```
OBS → RTMP → nginx HLS segments → browser player
```

### 1. OBS settings (most important)

**Settings → Output → Streaming**

| Setting | Value |
|---------|--------|
| Keyframe interval | **1** second (or **2** if 1 causes quality issues) |
| Rate control | CBR |
| Bitrate | 2500–4500 kbps |
| Preset | faster / veryfast (x264) or low-latency NVENC preset |
| Profile | main or high |

**Settings → Advanced → Streaming**

- Disable **Multitrack Video**
- If available: enable **Low latency mode** / reduce **Audio track** buffering

Keyframe interval **must match** nginx `hls_fragment` (repo default is now **1s**).

### 2. VPS nginx RTMP (after editing repo config)

On the VPS, update `/etc/nginx/nexlify.live-rtmp-hls.conf`:

```nginx
hls_fragment 1s;
hls_playlist_length 4s;
hls_sync 100ms;
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Shorter segments = lower delay, but more CPU and less stable playback on slow connections.

### 3. Deploy updated player

The site player uses hls.js **low-latency mode** and checks for live status every **3s** (not 15s).

```powershell
.\windows\scripts\deploy-livestream.ps1
```

### 4. Realistic expectations

| Setup | Typical delay |
|-------|----------------|
| Current HLS (tuned) | **~6–15 seconds** |
| Old settings (2s × 10s playlist + 15s poll) | **~20–40 seconds** |
| WebRTC (not set up yet) | **~1–3 seconds** |

For true “glass-to-glass” live (sporting events, chat sync), you would need **WebRTC** ingest/playback (e.g. MediaMTX, SRS, or Cloudflare Stream) instead of HLS. That is a larger change than nginx tuning.

### Quick test

1. Start OBS streaming  
2. Open https://nexlify.live/livestream  
3. Clap or show a timer on camera — compare to browser

Target after tuning: within **~10 seconds** on HLS.

## Troubleshooting OBS “Failed to connect”

Run on the VPS:

```bash
bash /home/nexlify-panel/scripts/diagnose-livestream.sh
```

Or paste checks manually:

```bash
sudo nginx -t
ss -tlnp | grep 1935
ls -la /var/www/nexlify-hls/
grep LIVESTREAM /var/www/nexlify/.env
```

### Checklist

| Issue | Fix |
|-------|-----|
| Port 1935 not listening | Fix `nginx -t`, ensure `include /etc/nginx/nexlify.live-rtmp-hls.conf;` is before `events {` in `nginx.conf` (no duplicate `load_module`) |
| Wrong OBS URL | Use `rtmp://rtmp.nexlify.live/live` — **not** `rtmps://` unless TLS is configured |
| Cloudflare proxy on RTMP | `rtmp.nexlify.live` must be **DNS only** (grey cloud); `nslookup` must show VPS IP, not 104.x |
| VPS firewall | `sudo ufw allow 1935/tcp` + cloud provider security group open on 1935 |
| Provider blocks 1935 | Some hosts block 1935; try alternate port (see below) |
| Stream key mismatch | Key `nexlify` → HLS at `/hls/nexlify.m3u8` |

### No sound on the livestream page

The player unmutes on click, but **OBS must send real audio**. On the server, a healthy stream has AAC audio around **128–192 kbps**. If ffprobe shows ~4 kb/s, the audio track is essentially silent.

**In OBS:**

1. Open **Settings → Audio** — confirm Desktop Audio / Mic/Aux devices are set (not Disabled).
2. In the **Audio Mixer**, green bars must move while you stream. If flat, the source is muted or wrong.
3. Right-click a source → **Advanced Audio Properties** → enable **Track 1** (or whichever track is used for streaming).
4. **Settings → Output → Streaming** — set Audio Bitrate to **160** or **192** (not 4).
5. If capturing a browser tab/window, enable **Capture audio** in the source properties (Chrome/Edge only).
6. Stop and restart the stream after changing audio settings.

**On the viewer page:** click once anywhere, or use the video **speaker icon** in the controls bar to unmute.

**Check audio on the VPS:**

```bash
LATEST=$(ls -t /var/www/nexlify-hls/nexlify-*.ts | head -1)
ffprobe -hide_banner -show_streams -select_streams a "$LATEST"
# Look for bit_rate — should be ~128000+, not ~4000
```

### Black screen but audio plays

Usually HLS segments are not starting on a video keyframe, or browser native fullscreen is hiding the video layer.

**Server (nginx RTMP):** `wait_key on` and `hls_fragment 2s` in `/etc/nginx/nexlify.live-rtmp-hls.conf`, then reload nginx and **restart the OBS stream**.

**In OBS:**

1. **Settings → Output → Streaming** (or Recording if using that encoder) — set **Keyframe Interval** to **1** (matches `hls_fragment 1s`).
2. Use **x264** or **NVENC** — avoid Multitrack Video on Custom RTMP.
3. Output resolution **1920×1080** or **1280×720** at **30 fps** if viewers on mobile struggle with 60 fps.
4. Stop streaming, wait 5s, start again after nginx/player changes.

**Check video on the VPS:**

```bash
LATEST=$(ls -t /var/www/nexlify-hls/nexlify-*.ts | head -1)
ffprobe -hide_banner -show_streams -select_streams v "$LATEST"
# Should show h264 with width/height > 0
```

### Alternate RTMP port (if 1935 blocked)

In `/etc/nginx/nexlify.live-rtmp-hls.conf` change `listen 1935;` to `listen 1936;`, reload nginx, open firewall, OBS server `rtmp://rtmp.nexlify.live:1936/live`.

## Deploy drop-in

From the panel repo on Windows:

```powershell
# Copy livestream pages into the marketing site tree, then rebuild on the VPS
.\windows\scripts\sync-to-vps.ps1
```

Or copy manually:

- `marketing-drop-in/src/app/livestream/` → `/var/www/nexlify/src/app/livestream/`
- `marketing-drop-in/src/app/api/livestream/` → `/var/www/nexlify/src/app/api/livestream/`
- `marketing-drop-in/src/components/LivestreamPlayer.tsx`
- `marketing-drop-in/src/components/ObsSetupPanel.tsx`
- `marketing-drop-in/src/lib/livestream.ts`

Then on the VPS: `cd /var/www/nexlify && npm run build && pm2 restart nexlify-web`
