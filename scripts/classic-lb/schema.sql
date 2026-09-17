-- Nexlify classic LB live connections (MySQL / MariaDB)
CREATE DATABASE IF NOT EXISTS nexlify_lb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nexlify_lb;

CREATE TABLE IF NOT EXISTS live_connections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  line_id VARCHAR(64) NOT NULL,
  stream_id VARCHAR(64) NOT NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(512) NULL,
  bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_line_stream_ip (line_id, stream_id, ip),
  KEY idx_last_seen (last_seen_at),
  KEY idx_line_seen (line_id, last_seen_at),
  KEY idx_stream_seen (stream_id, last_seen_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stream_sources (
  stream_id VARCHAR(64) NOT NULL PRIMARY KEY,
  source_url TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
