# 10GbE IPTV production hardening

Copy-paste guide for Ubuntu **20.04 / 22.04 / 24.04**. Tuned for **Nexlify** (XUI.ONE / Xtream-compatible control plane + splice edge), not for pushing MPEG-TS through PHP/nginx on the panel.

**Fleet this was written against (2026-09-14):**

| Role | Host | OS | NIC | What owns media |
|------|------|-----|-----|-----------------|
| Control plane | 45 `blades41.com` `45.88.138.18` | Ubuntu 24.04, 32 CPU, 125 GiB | `eth0` 10G DAC, **MTU 1500** | **Nothing.** nginx `:80/:443/:8080` returns **502** for `/live/` |
| Data plane | 10gbs `RE-S` `209.237.141.15` | Ubuntu 22.04, 24 CPU, 62 GiB | `enp45s0` 10G fibre, **MTU 1500** | Node `nexlify-iptv-edge` `:80/:8080/:25461`. **P2P owns `:443`** |

Login/catalog: `darkcdn.store` → 45. Play: `http://darkcdn.site` (port 80) → 10gbs splice.

Do **not** `fuser -k 8080` on 45 (kills nginx). Do **not** start `nexlify-iptv-edge` on 45. Do **not** `git reset --hard` on node 1.

---

## Topology lock (read before sysctl)

```text
App ── player_api / xmltv ──► 45 nginx :80/:443 ──► 127.0.0.1:13000 (Next)
App ── /live MPEG-TS      ──► 10gbs :80/:8080 (Node splice)
App ── HTTPS :443 play    ──► 10gbs p2ptv-balance   ← not splice; avoid advertising this
```

XUI.ONE equivalent: panel = PHP+MySQL+Redis; LB = nginx/php streamer that writes Redis. Nexlify: panel = Next+**Postgres**+Redis; LB = Node splice. **Do not install HAProxy or nginx TS proxy in front of the splice** unless you are adding a *second* edge. One extra hop on 10G is extra latency and another buffer.

**Jumbo MTU 9000 is optional and unsafe by default.** Both production NICs are 1500. Enabling jumbo without the switch, DAC/fibre, and origin path also being jumbo **black-holes TCP**. Leave 1500 unless you confirm end-to-end.

**IGMP (`igmp_qrv`, querier interval):** only for UDP multicast IPTV. Xtream HTTP TS is unicast. Ignore IGMP on this fleet.

---

## 1. Main server (control plane)

Applies to 45 and any future panel node. Goal: fast auth/catalog, **zero media bitrate**.

### 1.1 Kernel — `/etc/sysctl.d/99-nexlify-iptv.conf`

45 already has this (live values match). Re-apply is idempotent.

```bash
cat > /etc/sysctl.d/99-nexlify-iptv.conf <<'EOF'
# Nexlify panel — 10GbE control plane (not a TS splicer)
# somaxconn / syn backlog: nginx accept queue for player_api bursts (catalog dump)
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
# Softnet backlog: 10G can burst before nginx reads; 250k matches live 45
net.core.netdev_max_backlog = 250000
# Reuse TIME_WAIT for outbound panel→edge/auth. tcp_tw_recycle was removed; never set it.
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
# Keep congestion window after idle zaps (Xtream clients reconnect a lot)
net.ipv4.tcp_slow_start_after_idle = 0
# Discover path MTU if a hop is smaller than 1500 (safer than jumbo)
net.ipv4.tcp_mtu_probing = 1
# 16 MiB cap is enough for API/JSON. Do not copy the edge's 256 MiB here.
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.core.rmem_default = 1048576
net.core.wmem_default = 1048576
net.ipv4.tcp_rmem = 4096 1048576 16777216
net.ipv4.tcp_wmem = 4096 1048576 16777216
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
fs.file-max = 2097152
EOF

cat > /etc/sysctl.d/98-nexlify-bbr.conf <<'EOF'
# BBR + fq: smoother pacing for many short API responses
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF

sysctl --system
```

Ubuntu 20.04: confirm BBR exists (`ls /lib/modules/$(uname -r)/kernel/net/ipv4/tcp_bbr.ko*`). 22.04/24.04: built-in.

Repo helper (subset): `bash scripts/tune-kernel-20k.sh`

### 1.2 NIC — panel 10G (`eth0` on 45)

**Do not set MTU 9000.** Optional ring bump (off-peak; can drop a few packets for 1s):

```bash
IFACE=eth0   # 45 default route
ethtool -g "$IFACE"                    # max RX/TX 8192 on 45
ethtool -G "$IFACE" rx 4096 tx 4096    # 1024→4096; reboot-safe via netplan below
ethtool -K "$IFACE" gro on gso on tso on
# Adaptive coalescing is already on (rx-usecs 16). Leave it unless CPU softirq > 40%.
```

Persist rings with a oneshot unit (ethtool settings do not survive reboot):

```bash
cat > /etc/systemd/system/nexlify-nic-tune.service <<'EOF'
[Unit]
Description=Nexlify 10G ring / offload tune
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/ethtool -G eth0 rx 4096 tx 4096
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now nexlify-nic-tune.service
```

IRQ/RPS: 45 `eth0` is `qdisc mq` (multi-queue). Do **not** pin IRQs by hand unless `mpstat -P ALL 1` shows one core at 100% softirq. RPS is a last resort on single-queue NICs.

### 1.3 Limits

45: `/etc/security/limits.d/` is **empty**; systemd already sets `nexlify` `LimitNOFILE=1048576`. nginx is **65535** — enough because media is 502.

```bash
# SSH/cron user sessions
cat > /etc/security/limits.d/nexlify.conf <<'EOF'
* soft nofile 1048576
* hard nofile 1048576
root soft nofile 1048576
root hard nofile 1048576
nexlify soft nofile 1048576
nexlify hard nofile 1048576
EOF

# nginx (API only — still raise so catalog dumps do not hit EMFILE)
mkdir -p /etc/systemd/system/nginx.service.d
cat > /etc/systemd/system/nginx.service.d/nofile.conf <<'EOF'
[Service]
LimitNOFILE=1048576
EOF
systemctl daemon-reload
systemctl restart nginx   # off-peak; does not drop 10gbs splice
```

### 1.4 PostgreSQL (Nexlify panel) — **not MySQL**

45 listens `127.0.0.1:5432`. MariaDB `127.0.0.1:3306` is leftover XUI; leave bound to loopback; do not expose.

`/etc/postgresql/16/main/conf.d/99-nexlify.conf` (adjust version dir: 12/14/16):

```bash
# Detect
ls /etc/postgresql/*/main/postgresql.conf

cat > /etc/postgresql/16/main/conf.d/99-nexlify.conf <<'EOF'
# 125 GiB host: leave ~96 GiB for OS/Redis/Next; Postgres is catalog/auth not video
shared_buffers = 8GB
effective_cache_size = 48GB
work_mem = 32MB
maintenance_work_mem = 1GB
wal_compression = on
checkpoint_completion_target = 0.9
max_wal_size = 4GB
min_wal_size = 1GB
max_connections = 400
# liveConnection pulses: lots of small UPDATEs
random_page_cost = 1.1
effective_io_concurrency = 200
log_min_duration_statement = 500
EOF
systemctl reload postgresql
```

**MariaDB (only if a stock XUI PHP panel still runs on the box):**

```ini
# /etc/mysql/mariadb.conf.d/99-nexlify-xui.cnf
[mysqld]
bind-address = 127.0.0.1
max_connections = 500
innodb_buffer_pool_size = 2G
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
tmp_table_size = 64M
max_heap_table_size = 64M
skip-name-resolve
```

Nexlify does **not** need this for playback.

### 1.5 Nginx — panel API, media 502

`/etc/nginx/nginx.conf` (45 live: `worker_processes auto`, `worker_connections 8192`):

```nginx
user www-data;
worker_processes auto;
worker_rlimit_nofile 1048576;
pid /run/nginx.pid;

events {
    worker_connections 16384;  # 45 is 8192 today; raise with LimitNOFILE
    multi_accept on;
    use epoll;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;
    include /etc/nginx/mime.types;
    include /etc/nginx/conf.d/*.conf;
}
```

Media lock (already on 45 `:80/:443/:8080`):

```nginx
# Inside each panel server { }
location ~ ^/(live|timeshift|movie|series)/ {
    default_type text/plain;
    # Xtream apps ignore 302. 502 forces clients onto advertised LB.
    return 502 'use load balancer 209.237.141.15 for media';
}

location ~ ^/(player_api\.php|panel_api\.php|get\.php|xmltv\.php|c/|stalker_portal/) {
    proxy_pass http://127.0.0.1:13000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_send_timeout 3600s;
    proxy_read_timeout 3600s;
    proxy_buffering off;
    proxy_request_buffering off;
}
```

Re-apply from repo: `bash scripts/lock-live-routing.sh`

**Do not** put `proxy_pass` of `/live/` to 10gbs from 45. That hairpins 10G of video through the panel NIC.

### 1.6 HAProxy on the panel

**Skip.** 45 is not an L4 media LB. If you add a second splice edge later, HAProxy belongs in DNS/LB in front of **edges**, not in front of Next.js.

### 1.7 Wildcard TLS (panel domains)

45 nginx already terminates `:443` for `darkcdn.store`. Wildcard for `*.darkcdn.store` (DNS-01):

```bash
apt-get install -y certbot python3-certbot-dns-cloudflare
# /root/.secrets/cloudflare.ini  chmod 600
# dns_cloudflare_api_token = ...

certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d darkcdn.store -d '*.darkcdn.store' --agree-tos -m ops@darkcdn.store --non-interactive

# nginx ssl_certificate /etc/letsencrypt/live/darkcdn.store/fullchain.pem;
# ssl_certificate_key /etc/letsencrypt/live/darkcdn.store/privkey.pem;
nginx -t && systemctl reload nginx
```

Do **not** point `darkcdn.site` HTTPS at 45. Play host A-record must stay on 10gbs. Putting splice TLS on 10gbs `:443` requires moving **p2ptv-balance** off that port first.

### 1.8 Security (panel)

UFW is **inactive** on 45 (provider/edge firewall). If you enable it:

```bash
# Do not lock yourself out — SSH first
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment SSH
ufw allow 80/tcp
ufw allow 443/tcp
# 8080 on 45 is nginx 502 only; optional
ufw allow 8080/tcp
# NEVER public: 3306 5432 6379 13000 3000
ufw deny 3306/tcp
ufw deny 5432/tcp
ufw deny 6379/tcp
ufw deny 13000/tcp
ufw --force enable

# Repo helper:
# bash scripts/nexlify-firewall-ports.sh
```

fail2ban — SSH + panel login, **not** `/live/` (there is no TS on 45):

```bash
apt-get install -y fail2ban
cat > /etc/fail2ban/jail.d/nexlify-panel.conf <<'EOF'
[sshd]
enabled = true
maxretry = 4
bantime = 1h

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
EOF
systemctl enable --now fail2ban
```

SSH: `PasswordAuthentication no`, keys only, `AllowUsers` restricted. Do not change SSH port without updating the provider console.

### 1.9 Prometheus node_exporter (panel)

```bash
apt-get install -y prometheus-node-exporter
# listens 127.0.0.1:9100 on Ubuntu package — scrape via VPN/SSH tunnel, not public
```

---

## 2. 10Gb edge (data plane)

Applies to 10gbs. Goal: one origin pull per unique URL, fan-out TS, no extra proxy buffer.

### 2.1 Kernel — persist what is **already live**

10gbs **live** sockets are more aggressive than `/etc/sysctl.d/99-nexlify-iptv.conf` (that file is the 16 MiB “20k” template). `99-p2ptv-iptv.conf` likely raised rmem. **A reboot can drop rmem_max from 256 MiB → 16 MiB.** Persist the live set:

```bash
cat > /etc/sysctl.d/99-nexlify-edge.conf <<'EOF'
# Nexlify splice edge — 10GbE unicast MPEG-TS
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 262144
net.core.netdev_max_backlog = 250000
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_mtu_probing = 1
# 128–256 MiB: large origin + many slow last-mile sockets. 16 MiB is too small on 10G.
net.core.rmem_max = 268435456
net.core.wmem_max = 268435456
net.core.rmem_default = 1048576
net.core.wmem_default = 1048576
net.ipv4.tcp_rmem = 8192 262144 134217728
net.ipv4.tcp_wmem = 8192 262144 134217728
# Ephemeral ports for origin pulls + REST to panel
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_keepalive_time = 120
net.ipv4.tcp_keepalive_intvl = 15
net.ipv4.tcp_keepalive_probes = 5
fs.file-max = 2097152
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
# Optional: wake writers sooner on splice (Linux ≥ 3.12). 0 = default.
# net.ipv4.tcp_notsent_lowat = 131072
EOF
sysctl --system
```

Keep `IPTV_EDGE_COALESCE_SAME_URL=1` in `/opt/nexlify-panel/.env` (already set). Edge `loadDotEnv()` reads `IPTV_EDGE_*` on start.

### 2.2 NIC — `enp45s0`

**Highest-value change on this box:** rings are **1024** of **8192** max. Under fan-out, RX/TX drops show up as buffering even when the origin is fine.

```bash
IFACE=enp45s0
ethtool "$IFACE"          # expect Speed 10000Mb/s Full fibre
ethtool -g "$IFACE"
ethtool -G "$IFACE" rx 4096 tx 4096
ethtool -K "$IFACE" gro on gso on tso on lro off
# Adaptive RX coalesce is on (rx-usecs 16). If CPU is idle and drops persist:
# ethtool -C "$IFACE" adaptive-rx off rx-usecs 8 rx-frames 32
```

Persist:

```bash
cat > /etc/systemd/system/nexlify-nic-tune.service <<'EOF'
[Unit]
Description=Nexlify edge 10G ring tune
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/ethtool -G enp45s0 rx 4096 tx 4096
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now nexlify-nic-tune.service
```

**MTU 9000:** only if `ping -M do -s 8972 <switch-peer>` works and the origin path is jumbo. Otherwise leave 1500.

IRQ: `rps_cpus` on rx-0 is `00000000` (off). Multi-queue hardware already spreads. Enable RPS only if `ethtool -l` shows 1 combined channel.

### 2.3 Limits + systemd

Already present: `/etc/security/limits.d/nexlify.conf` nofile 1048576; `pm2-root` `LimitNOFILE=infinity`.

```bash
mkdir -p /etc/systemd/system/pm2-root.service.d
cat > /etc/systemd/system/pm2-root.service.d/limits.conf <<'EOF'
[Service]
LimitNOFILE=1048576
LimitNPROC=infinity
TasksMax=infinity
EOF
systemctl daemon-reload
# Do not restart pm2-root during a live event (drops all splice sockets)
```

### 2.4 Nginx / HAProxy on the edge

**Current:** Node owns `:80/:8080/:25461`. **Do not install nginx on those ports.** HAProxy in front of Node adds a buffer unless:

```
timeout client 1h
timeout server 1h
no option httpclose
# and never option http-buffer-request
```

Do not steal `:443` from p2ptv without a planned cutover.

### 2.5 Redis (local slots)

10gbs Redis is **local** (`127.0.0.1:6379`) for connection caps. Panel dashboard reads **Postgres on 45**. Do not point edge Redis at 45 unless you intend XUI-style shared live keys (separate project).

### 2.6 TLS on the edge

Wildcard `*.darkcdn.site` is useless on splice until Node or nginx owns `:443`. Today HTTPS play hits P2P. Keep advertising **HTTP :80**.

### 2.7 Security (edge)

UFW inactive. If enabled: allow `22,80,8080,25461,443/tcp`. Deny `6379`, `8091` (p2ptv seeder is already localhost). fail2ban on SSH only — jailing `/live/` IPs will kick paying viewers.

### 2.8 node_exporter

Same as panel. Scrape privately.

---

## 3. Verification and monitoring

### 3.1 One-shot health

```bash
# --- 45 ---
curl -sS -m 5 http://127.0.0.1:13000/api/health
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1/live/x/x/1.ts   # expect 502
sysctl net.core.somaxconn net.core.rmem_max net.ipv4.tcp_congestion_control
ss -lntp | grep -E ':80|:443|:8080|:13000|:5432|:3306|:6379'

# --- 10gbs ---
curl -sS http://127.0.0.1:8080/edge/health
# expect: fans coalesced (streamAliases >= fans), eventLoopLagMs ~ 0
ss -lntp | grep -E ':80|:443|:8080|:25461'
# node on 80/8080/25461; p2ptv on 443
```

Play advertisement (from 45):

```bash
curl -sS http://127.0.0.1:13000/player_api.php \
  | python3 -c 'import json,sys; s=json.load(sys.stdin)["server_info"]; print(s["url"], s["server_protocol"], s["port"], s["https_port"])'
# expect: darkcdn.site http 80 443
```

### 3.2 NIC / kernel

```bash
IFACE=$(ip -o route get 1.1.1.1 | awk '{print $5; exit}')
ethtool "$IFACE"
ethtool -S "$IFACE" | grep -Ei 'drop|discard|error|miss|fifo' | grep -v ': 0$'
ethtool -g "$IFACE"
nstat -az | grep -E 'TcpRetrans|ListenOverflows|ListenDrops|TCPBacklogDrop|TcpExtListen'
cat /proc/net/softnet_stat   # column 2 = drops; should stay 0
ss -s
ss -tnp | awk '/:80 |:8080|:443/{c[$1]++} END{for (k in c) print k,c[k]}'
```

### 3.3 Throughput (splice health)

Healthy splice: **egress ≫ ingress** (one origin pull, many clients).

```bash
IFACE=$(ip -o route get 1.1.1.1 | awk '{print $5; exit}')
RX1=$(cat /sys/class/net/$IFACE/statistics/rx_bytes)
TX1=$(cat /sys/class/net/$IFACE/statistics/tx_bytes)
sleep 2
RX2=$(cat /sys/class/net/$IFACE/statistics/rx_bytes)
TX2=$(cat /sys/class/net/$IFACE/statistics/tx_bytes)
python3 -c "print('in_mbps', round(($RX2-$RX1)*8/2e6,1), 'out_mbps', round(($TX2-$TX1)*8/2e6,1))"
# apt install iftop iptraf-ng
# iftop -n -i "$IFACE"
```

If `in_mbps` ≈ `out_mbps` × N duplicate catalog rows, fans are **not** coalesced.

### 3.4 Prometheus node_exporter extras

```yaml
# scrape both :9100 over a private network
# Alert: node_network_receive_drop_total rate > 0
# Alert: node_softnet_dropped_total rate > 0
# Alert: node_network_speed_bytes{device="enp45s0"} saturating > 0.85
```

---

## Capacity guidance

Line rate: **10 Gbps = 10_000 Mbps**. Plan **80% = 8_000 Mbps** egress.

| Profile | Typical bitrate | Clients on one 10G edge at 80% |
|---------|-----------------|--------------------------------|
| SD | ~2.5 Mbps | ~3200 |
| HD | ~5 Mbps | ~1600 |
| FHD | ~8 Mbps | ~1000 |
| 4K | ~16 Mbps | ~500 |

**Splice math:** ingest ≈ `(unique origin URLs) × bitrate`. Egress ≈ `clients × bitrate`. Coalescing four clones of the same URL cuts ingest 4×.

**CPU bound:** Node splice is one event loop. This 24-core 10gbs box will hit event-loop lag / lagged-skips before the NIC if you run offline-splash ffmpeg, four isolated origin pulls, or P2P on the same CPU.

**Practical target for 10gbs (RE-S):** 1_500–3_000 concurrent **real TCP** HD clients with coalesce on, splash idle, play on `:80/:8080`. Do not size from in-memory `clients` if `ss` ESTAB is much lower.

**Panel 45:** 32 cores / 125 GiB is oversized for API. It is **not** a second splice node while nginx 502s `/live/`.

---

## What is already done vs next (this fleet)

| Item | 45 | 10gbs |
|------|----|-------|
| BBR + fq | yes | yes |
| somaxconn / backlog | yes | yes (live even higher) |
| rmem 256 MiB persisted | n/a (16 MiB correct) | **no — persist §2.1** |
| Ring 4096 | still 1024 | still 1024 — **do this** |
| MTU 9000 | no (correct) | no (correct) |
| UFW | inactive | inactive |
| limits.d | missing (systemd covers nexlify) | present |
| Media 502 | yes | n/a |
| Coalesce same URL | n/a | **on** |
| Play HTTP :80 | **on** | splice listening |

---

## Clarifying questions (needed before jumbo / second edge / HAProxy)

1. **Switch/ToR MTU** — is the 10G DAC/fibre VLAN jumbo (9000) end-to-end, including the origin CDN path? If unknown, stay at 1500.
2. **NIC driver** — 45 is 10G DAC (likely Intel/Mellanox); 10gbs `enp45s0` fibre. Confirm `ethtool -i eth0` / `enp45s0` (mlx5 vs ixgbe vs bnxt) before IRQ scripts.
3. **P2P on :443** — keep `p2ptv-balance` or move splice TLS onto 443? Until that call, never advertise HTTPS play.
4. **MariaDB on 45** — still needed for leftover XUI, or can it be stopped?
5. **How many sold max-connections × lines** vs real concurrent? Capacity table needs sold HD vs FHD mix.
6. **Second edge** — when you add one, we do DNS/RR or HAProxy **in front of edges only**, still never on 45 `/live/`.
