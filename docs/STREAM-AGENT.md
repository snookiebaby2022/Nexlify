# Nexlify stream server agent

The panel stores streaming settings; the **agent** on each stream node applies them and reports ffmpeg/nginx process health.

## Setup

1. **Admin → Servers → Manage servers** — edit a server, open **Stream server agent**, click **Generate token**.
2. On the stream VPS, install the script:

```bash
chmod +x /opt/nexlify-stream-agent.sh
# copy from repo: scripts/nexlify-stream-agent.sh
```

3. Environment:

```bash
export PANEL_URL="https://panel.example.com"
export AGENT_TOKEN="<paste token>"
export POLL_SECS=30
# Optional: reload nginx after config push
export NGINX_RELOAD_CMD="/home/nexlify/bin/nginx/sbin/nginx -s reload"
```

4. Run under systemd or screen:

```bash
./nexlify-stream-agent.sh
```

## What the agent does

| Endpoint | Direction | Purpose |
|----------|-----------|---------|
| `GET /api/agent/poll` | Agent → Panel | Fetch pending commands + nginx/ffmpeg config from **Settings → Streaming** |
| `POST /api/agent/heartbeat` | Agent → Panel | Report process list (PID, CPU, status) |
| `POST /api/agent/ack` | Agent → Panel | Mark commands done/failed |

Admin actions (**Push config**, **Restart** on **Process monitor**) enqueue commands the agent picks up on the next poll.

## Auto-restart

Cron (`/api/cron`) runs `agent_auto_restart`: stale processes (no heartbeat for 2 minutes) with **Auto-restart** enabled get a `restart_stream` command.

## Import queue

Watch folders with **Auto-scan minutes** enqueue jobs; cron runs `import_queue` one job per minute tick.

## SSH (optional)

SSH fields on the server record are for your own automation. The HTTP agent is the supported path; wire `NGINX_RELOAD_CMD` / `STREAM_CMD` on the node to match your XUI ffmpeg layout.
