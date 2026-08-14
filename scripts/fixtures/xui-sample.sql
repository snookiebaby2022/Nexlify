CREATE TABLE `streams` (
  `id` int(11) NOT NULL,
  `type` int(11) DEFAULT NULL,
  `category_id` varchar(255) DEFAULT NULL,
  `stream_display_name` varchar(255) DEFAULT NULL,
  `stream_source` mediumtext,
  `stream_icon` varchar(255) DEFAULT NULL,
  `notes` mediumtext,
  `target_container` varchar(20) DEFAULT NULL,
  `epg_id` varchar(255) DEFAULT NULL,
  `channel_id` varchar(255) DEFAULT NULL,
  `order_num` int(11) DEFAULT 0
);
CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `member_id` int(11) DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `password` varchar(50) DEFAULT NULL,
  `exp_date` int(11) DEFAULT NULL,
  `admin_enabled` int(11) DEFAULT 1,
  `enabled` int(11) DEFAULT 1,
  `admin_notes` text,
  `bouquet` mediumtext,
  `max_connections` int(11) DEFAULT 1
);
CREATE TABLE `reg_users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) DEFAULT NULL,
  `password` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `member_group_id` int(11) DEFAULT 2,
  `credits` float DEFAULT 0,
  `status` int(11) DEFAULT 1,
  `owner_id` int(11) DEFAULT 0
);
CREATE TABLE `bouquets` (
  `id` int(11) NOT NULL,
  `bouquet_name` varchar(255) DEFAULT NULL,
  `bouquet_channels` mediumtext
);
CREATE TABLE `streams_sys` (
  `stream_id` int(11) NOT NULL,
  `server_id` int(11) NOT NULL
);
CREATE TABLE `series` (
  `id` int(11) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `category_id` varchar(255) DEFAULT NULL,
  `cover` varchar(255) DEFAULT NULL
);
CREATE TABLE `series_episodes` (
  `id` int(11) NOT NULL,
  `series_id` int(11) DEFAULT NULL,
  `season_num` int(11) DEFAULT NULL,
  `episode_num` int(11) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `stream_source` mediumtext
);
INSERT INTO `streams` (`id`,`type`,`category_id`,`stream_display_name`,`stream_source`,`stream_icon`,`notes`,`target_container`,`epg_id`,`channel_id`,`order_num`) VALUES
(1,1,'[10]','News HD','["http://example.com/live/1","http://backup/1"]',NULL,NULL,NULL,'epg1','ch1',1),
(2,2,'[11]','Movie A','["http://example.com/movie/a"]',NULL,NULL,'mp4',NULL,NULL,2),
(3,5,'[12]','Show S1','["http://example.com/series/wrong"]',NULL,NULL,NULL,NULL,NULL,3),
(4,4,'[10]','Radio FM','["http://example.com/radio"]',NULL,NULL,NULL,NULL,NULL,4);
INSERT INTO `users` (`id`,`member_id`,`username`,`password`,`exp_date`,`admin_enabled`,`enabled`,`admin_notes`,`bouquet`,`max_connections`) VALUES
(10,5,'line1','pass1',2000000000,1,1,NULL,'[1]',2);
INSERT INTO `reg_users` (`id`,`username`,`password`,`email`,`member_group_id`,`credits`,`status`,`owner_id`) VALUES
(5,'reseller1','rpass','a@b.c',2,100,1,0);
INSERT INTO `bouquets` (`id`,`bouquet_name`,`bouquet_channels`) VALUES
(1,'Main','{"live":[1,4],"movie":[2],"series":[3]}');
INSERT INTO `streams_sys` (`stream_id`,`server_id`) VALUES (1,9),(2,9);
INSERT INTO `series` (`id`,`title`,`category_id`,`cover`) VALUES (7,'Cool Show','[12]',NULL);
INSERT INTO `series_episodes` (`id`,`series_id`,`season_num`,`episode_num`,`title`,`stream_source`) VALUES
(100,7,1,1,'Pilot','["http://example.com/ep/1"]');
