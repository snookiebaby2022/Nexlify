#!/usr/bin/env bash
# Full Nexlify VPS backup → tarball → upload to cPanel (overwrite remote files).
# Schedule: weekly (see install-vps-backup-cron.sh).
set -euo pipefail

STAMP="$(date -u +%Y%m%d-%H%M%S)"
WORKDIR="${BACKUP_WORKDIR:-/var/backups/nexlify}"
REMOTE_NAME="${BACKUP_REMOTE_NAME:-nexlify-vps-backup}"
ENV_FILE="${BACKUP_ENV_FILE:-/root/.nexlify-backup.env}"

PANEL_DIR="${PANEL_DIR:-/home/nexlify-panel}"
WEB_DIR="${WEB_DIR:-/var/www/nexlify}"
WHMCS_DIR="${WHMCS_DIR:-/var/www/whmcs}"
WHMCS_PRIVATE="${WHMCS_PRIVATE:-/var/www/whmcs_private}"
MUSIC_RELAY="${MUSIC_RELAY:-/opt/nexlify-music-relay}"

mkdir -p "$WORKDIR/staging-$STAMP"
STAGE="$WORKDIR/staging-$STAMP"
ARCHIVE="$WORKDIR/${REMOTE_NAME}.tar.gz"
LOG="${BACKUP_LOG:-/var/log/nexlify-backup.log}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"; }

log "=== Nexlify VPS backup start ($STAMP) ==="

# --- PostgreSQL (panel) ---
PANEL_ENV="$PANEL_DIR/.env"
if [[ -f "$PANEL_ENV" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$PANEL_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  export DATABASE_URL
fi
if [[ -n "${DATABASE_URL:-}" ]]; then
  log "Dumping PostgreSQL…"
  pg_dump "$DATABASE_URL" | gzip -9 > "$STAGE/postgres-nexlify.sql.gz"
else
  log "WARN: DATABASE_URL not set — skipping PostgreSQL dump"
fi

# --- SQLite (marketing site) ---
if [[ -f "$WEB_DIR/data/nexlify.db" ]]; then
  log "Copying marketing SQLite DB…"
  sqlite3 "$WEB_DIR/data/nexlify.db" ".backup '$STAGE/nexlify-web.db'"
  gzip -9 -f "$STAGE/nexlify-web.db"
fi

# --- Env + secrets (restricted permissions in archive) ---
mkdir -p "$STAGE/env"
for f in "$PANEL_DIR/.env" "$WEB_DIR/.env" /etc/nginx/sites-enabled/*; do
  [[ -e "$f" ]] && cp -a "$f" "$STAGE/env/" 2>/dev/null || true
done
[[ -d /etc/letsencrypt ]] && tar -czf "$STAGE/letsencrypt.tar.gz" -C /etc letsencrypt 2>/dev/null || true

# --- PM2 process list ---
pm2 save >/dev/null 2>&1 || true
[[ -f /root/.pm2/dump.pm2 ]] && cp -a /root/.pm2/dump.pm2 "$STAGE/pm2-dump.pm2"

# --- Application trees (exclude heavy/build dirs) ---
tar_excludes=(--exclude=node_modules --exclude=.next --exclude=.git --exclude='*.log')

log "Archiving panel ($PANEL_DIR)…"
tar -czf "$STAGE/nexlify-panel.tar.gz" "${tar_excludes[@]}" -C "$(dirname "$PANEL_DIR")" "$(basename "$PANEL_DIR")"

log "Archiving website ($WEB_DIR)…"
tar -czf "$STAGE/nexlify-website.tar.gz" "${tar_excludes[@]}" --exclude=data/nexlify.db -C "$(dirname "$WEB_DIR")" "$(basename "$WEB_DIR")"

if [[ -d "$WHMCS_DIR" ]]; then
  log "Archiving WHMCS…"
  tar -czf "$STAGE/whmcs.tar.gz" "${tar_excludes[@]}" \
    --exclude=attachments --exclude=downloads \
    -C /var/www whmcs
fi
if [[ -d "$WHMCS_PRIVATE" ]]; then
  tar -czf "$STAGE/whmcs-private.tar.gz" -C /var/www whmcs_private
fi
if [[ -d "$MUSIC_RELAY" ]]; then
  tar -czf "$STAGE/music-relay.tar.gz" "${tar_excludes[@]}" -C /opt nexlify-music-relay
fi

# --- Manifest ---
{
  echo '{'
  echo "  \"createdAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"hostname\": \"$(hostname -f 2>/dev/null || hostname)\","
  echo "  \"stamp\": \"$STAMP\","
  echo '  "files": ['
  first=1
  for f in "$STAGE"/*; do
    [[ -f "$f" ]] || continue
    [[ "$first" -eq 1 ]] || echo ','
    first=0
    printf '    "%s"' "$(basename "$f")"
  done
  echo ''
  echo '  ]'
  echo '}'
} > "$STAGE/manifest.json"

log "Creating master archive…"
tar -czf "$ARCHIVE" -C "$STAGE" .
ls -lh "$ARCHIVE" | tee -a "$LOG"

# --- Upload individual files + master (overwrite remote) ---
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

upload_to_cpanel() {
  local local_file="$1"
  local remote_file="$2"
  if [[ -z "${CPANEL_FTP_HOST:-}" || -z "${CPANEL_FTP_USER:-}" || -z "${CPANEL_FTP_PASS:-}" ]]; then
    log "WARN: CPANEL_FTP_* not configured in $ENV_FILE — skip upload"
    return 1
  fi
  local port="${CPANEL_FTP_PORT:-21}"
  local remote_dir="${CPANEL_FTP_PATH:-public_html/nexlify/backups}"
  if ! command -v lftp >/dev/null 2>&1; then
    log "Installing lftp…"
    apt-get update -qq && apt-get install -y -qq lftp
  fi
  log "Uploading $(basename "$local_file") → $remote_dir/$remote_file"
  lftp -u "$CPANEL_FTP_USER","$CPANEL_FTP_PASS" -p "$port" "$CPANEL_FTP_HOST" <<LFTP
set ftp:ssl-allow true
set ssl:verify-certificate no
cd $remote_dir || mkdir -p $remote_dir; cd $remote_dir
put -O . $local_file -o $remote_file
bye
LFTP
}

UPLOAD_OK=0
if upload_to_cpanel "$ARCHIVE" "${REMOTE_NAME}.tar.gz"; then
  UPLOAD_OK=1
  for f in "$STAGE"/*; do
    [[ -f "$f" ]] && upload_to_cpanel "$f" "$(basename "$f")" || true
  done
  # manifest always at fixed name
  upload_to_cpanel "$STAGE/manifest.json" "manifest.json" || true
fi

# --- Local retention (7 days) ---
find "$WORKDIR" -maxdepth 1 -name 'staging-*' -type d -mtime +1 -exec rm -rf {} + 2>/dev/null || true
find "$WORKDIR" -maxdepth 1 -name "${REMOTE_NAME}.tar.gz" -mtime +7 -delete 2>/dev/null || true

rm -rf "$STAGE"
if [[ "$UPLOAD_OK" -eq 1 ]]; then
  log "=== Backup complete — uploaded to cPanel ($CPANEL_FTP_HOST/$CPANEL_FTP_PATH) ==="
else
  log "=== Backup archive saved locally: $ARCHIVE (upload skipped or failed) ==="
fi
