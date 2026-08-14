-- Sanitized modern XUI.one fixture matching real MariaDB `xui` schema shapes
-- (plain JSON arrays in bouquet_* columns, bouquet_order, days_keep, mag_id PK).
CREATE TABLE `lines` (
  `id` int(11) NOT NULL, `member_id` int(11) DEFAULT NULL, `username` varchar(50), `password` varchar(50),
  `exp_date` int(11), `admin_enabled` int(11) DEFAULT 1, `enabled` int(11) DEFAULT 1,
  `admin_notes` text, `reseller_notes` text, `bouquet` mediumtext, `max_connections` int(11) DEFAULT 1,
  `is_restreamer` int(11) DEFAULT 0, `is_trial` int(11) DEFAULT 0
);
CREATE TABLE `users` (
  `id` int(11) NOT NULL, `username` varchar(50), `password` varchar(50), `email` varchar(255),
  `member_group_id` int(11), `credits` float, `notes` text, `status` int(11), `owner_id` int(11)
);
CREATE TABLE `streams` (
  `id` int(11) NOT NULL, `type` int(11), `category_id` varchar(255), `stream_display_name` varchar(255),
  `stream_source` mediumtext, `stream_icon` varchar(255), `notes` text,
  `target_container` varchar(20), `epg_id` int(11), `channel_id` varchar(255), `order` int(11)
);
CREATE TABLE `streams_types` (
  `type_id` int(11) NOT NULL, `type_name` varchar(255), `type_key` varchar(255),
  `type_output` varchar(255), `live` tinyint(4)
);
CREATE TABLE `streams_series` (
  `id` int(11) NOT NULL, `title` varchar(255), `category_id` varchar(255), `cover` varchar(255)
);
CREATE TABLE `streams_episodes` (
  `id` int(11) NOT NULL, `season_num` int(11), `series_id` int(11), `stream_id` int(11), `episode_num` int(11)
);
CREATE TABLE `streams_servers` (
  `server_stream_id` int(11) NOT NULL, `stream_id` int(11), `server_id` int(11),
  `current_source` mediumtext, `on_demand` tinyint(1) DEFAULT 0
);
CREATE TABLE `bouquets` (
  `id` int(11) NOT NULL, `bouquet_name` varchar(255), `bouquet_channels` mediumtext,
  `bouquet_movies` mediumtext, `bouquet_series` mediumtext, `bouquet_radios` mediumtext, `bouquet_order` int(11)
);
CREATE TABLE `servers` (
  `id` int(11) NOT NULL, `server_name` varchar(255), `domain_name` varchar(255), `server_ip` varchar(50),
  `http_broadcast_port` int, `https_broadcast_port` int
);
CREATE TABLE `streams_categories` (
  `id` int(11) NOT NULL, `category_type` varchar(20), `category_name` varchar(255),
  `parent_id` int, `cat_order` int, `is_adult` int
);
CREATE TABLE `users_packages` (
  `id` int(11) NOT NULL, `package_name` varchar(255), `is_trial` int, `is_official` int,
  `trial_credits` float, `official_credits` float, `trial_duration` int, `trial_duration_in` varchar(20),
  `official_duration` int, `official_duration_in` varchar(20), `bouquets` mediumtext, `max_connections` int
);
CREATE TABLE `epg` (
  `id` int(11) NOT NULL, `epg_name` varchar(255), `epg_file` varchar(1024), `days_keep` int
);
CREATE TABLE `mag_devices` (
  `mag_id` int(11) NOT NULL, `user_id` int, `mac` varchar(50)
);
CREATE TABLE `providers` (
  `id` int(11) NOT NULL, `name` varchar(128), `ip` varchar(128), `port` int, `username` varchar(128),
  `password` varchar(128), `enabled` tinyint(1), `ssl` tinyint(1), `legacy` tinyint(1)
);

INSERT INTO `streams_types` VALUES
(1,'Live Streams','live','live',1),
(2,'Movies','movie','movie',0),
(3,'Created Channels','created_live','live',1),
(4,'Radio Stations','radio_streams','live',1),
(5,'TV Series','series','series',0);

INSERT INTO `lines` (`id`,`member_id`,`username`,`password`,`exp_date`,`admin_enabled`,`enabled`,`admin_notes`,`reseller_notes`,`bouquet`,`max_connections`,`is_restreamer`,`is_trial`) VALUES
(10,5,'line1','pass1',2000000000,1,1,NULL,NULL,'[1]',2,0,0);

INSERT INTO `users` (`id`,`username`,`password`,`email`,`member_group_id`,`credits`,`notes`,`status`,`owner_id`) VALUES
(5,'reseller1','rpass','a@b.c',2,100,NULL,1,0),
(1,'admin','apass','admin@x.com',1,0,NULL,1,0);

INSERT INTO `streams` (`id`,`type`,`category_id`,`stream_display_name`,`stream_source`,`stream_icon`,`notes`,`target_container`,`epg_id`,`channel_id`,`order`) VALUES
(1,1,'[10]','News HD','["http://user:secret@cdn.example.com/live/1","http://user:secret@cdn2.example.com/live/1","http://user:secret@cdn3.example.com/live/1"]',NULL,NULL,NULL,1,'ch1',1),
(2,2,'[11]','Movie A','["http://vod.example.com/movie/a.mp4"]',NULL,NULL,'mp4',NULL,NULL,2),
(3,1,'[10]','Empty Source Live','[]',NULL,NULL,NULL,NULL,'ch3',0),
(50,5,'[12]','Pilot Ep File','["http://example.com/ep/1"]',NULL,NULL,'mp4',NULL,NULL,3);

INSERT INTO `streams_series` (`id`,`title`,`category_id`,`cover`) VALUES (7,'Cool Show','[12]',NULL);
INSERT INTO `streams_episodes` (`id`,`season_num`,`series_id`,`stream_id`,`episode_num`) VALUES (100,1,7,50,1);
INSERT INTO `streams_servers` (`server_stream_id`,`stream_id`,`server_id`,`current_source`,`on_demand`) VALUES
(1,1,9,'["http://user:secret@cdn.example.com/live/1"]',1),
(2,50,9,NULL,1),
(3,3,9,'["http://edge.example.com/live/empty-source-fixed"]',1);

-- Real XUI.one stores plain ID arrays (not {"live":[...]} objects)
INSERT INTO `bouquets` (`id`,`bouquet_name`,`bouquet_channels`,`bouquet_movies`,`bouquet_series`,`bouquet_radios`,`bouquet_order`) VALUES
(1,'Main','[1]','[2]','[7]',NULL,0),
(3,'Adult','[1]',NULL,NULL,NULL,5);

INSERT INTO `servers` (`id`,`server_name`,`domain_name`,`server_ip`,`http_broadcast_port`,`https_broadcast_port`) VALUES
(9,'Main','x.example.com','1.2.3.4',80,443);

INSERT INTO `streams_categories` (`id`,`category_type`,`category_name`,`parent_id`,`cat_order`,`is_adult`) VALUES
(10,'live','News',0,1,0),(11,'movie','Movies',0,2,0),(12,'series','Series',0,3,0);

INSERT INTO `users_packages` (`id`,`package_name`,`is_trial`,`is_official`,`trial_credits`,`official_credits`,`trial_duration`,`trial_duration_in`,`official_duration`,`official_duration_in`,`bouquets`,`max_connections`) VALUES
(1,'12 month no xxx',0,1,0,10,0,'hours',12,'months','[1]',1),
(3,'24 hour trial',1,0,0,0,24,'hours',0,'hours','[1]',1);

INSERT INTO `epg` (`id`,`epg_name`,`epg_file`,`days_keep`) VALUES
(1,'UK EPG','https://example.com/epg.xml',7);

INSERT INTO `mag_devices` (`mag_id`,`user_id`,`mac`) VALUES
(1,10,'00:1A:79:00:00:01');

INSERT INTO `providers` (`id`,`name`,`ip`,`port`,`username`,`password`,`enabled`,`ssl`,`legacy`) VALUES
(11,'Provider A','provider.example.com',443,'user','pass',1,1,0);
