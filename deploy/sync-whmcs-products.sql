-- Nexlify WHMCS product + GBP pricing sync
-- Currency: GBP = id 2

-- Store URLs require product slugs
UPDATE tblproducts SET slug = 'starter-package' WHERE id = 1;
UPDATE tblproducts SET slug = 'main-package' WHERE id = 2;
UPDATE tblproducts SET slug = 'top-tier' WHERE id = 3;
UPDATE tblproducts SET slug = 'plex-plugin' WHERE id = 4;
UPDATE tblproducts SET slug = 'emby-plugin' WHERE id = 5;
UPDATE tblproducts SET slug = 'jellyfin-plugin' WHERE id = 6;
UPDATE tblproducts SET slug = 'youtube-plugin' WHERE id = 7;
UPDATE tblproducts SET slug = 'spotify-plugin' WHERE id = 8;
UPDATE tblproducts SET slug = 'apple-music-plugin' WHERE id = 9;
UPDATE tblproducts SET slug = 'deezer-plugin' WHERE id = 10;
UPDATE tblproducts SET slug = 'youtube-music-plugin' WHERE id = 11;
UPDATE tblproducts SET slug = 'statistics-plugin' WHERE id = 12;
-- Product 13 (Proxy Plugins) retired — built into IPTV panel
UPDATE tblproducts SET slug = 'proxy-plugins', hidden = 1, retired = 1,
  description = 'Retired — proxy tooling is included with the Nexlify panel.'
WHERE id = 13;

-- License products: type "other" (not "server") — avoids customer "Configure Server" form
UPDATE tblproducts SET
  hidden = 0,
  retired = 0,
  type = 'other',
  showdomainoptions = 0,
  servertype = 'streambilling',
  servergroup = 1,
  paytype = 'recurring',
  autosetup = 'payment'
WHERE id BETWEEN 1 AND 16 AND id <> 13;

-- Product groups: 1 = Nexlify Packages, 2 = Panel Plugins
UPDATE tblproducts SET gid = 1 WHERE id BETWEEN 1 AND 3;
UPDATE tblproducts SET gid = 2 WHERE id BETWEEN 4 AND 16;

-- Descriptions
UPDATE tblproducts SET description = 'Entry IPTV panel license — 1 main server, 2 load balancers. Billed in GBP.' WHERE id = 1;
UPDATE tblproducts SET description = 'Core IPTV panel license — 1 main server, 10 load balancers. Billed in GBP.' WHERE id = 2;
UPDATE tblproducts SET description = 'Full-scale IPTV panel license — 1 main server, 50 load balancers. All plugins included. Billed in GBP.' WHERE id = 3;
UPDATE tblproducts SET description = 'Plex library import for your Nexlify panel. Requires an active panel license. Billed in GBP.' WHERE id = 4;
UPDATE tblproducts SET description = 'Emby library import for your Nexlify panel. Requires an active panel license. Billed in GBP.' WHERE id = 5;
UPDATE tblproducts SET description = 'Jellyfin library import for your Nexlify panel. Requires an active panel license. Billed in GBP.' WHERE id = 6;
UPDATE tblproducts SET description = 'YouTube content integration for your Nexlify panel. Requires an active panel license. Billed in GBP.' WHERE id = 7;
UPDATE tblproducts SET description = 'Spotify integration for your Nexlify panel. Requires an active panel license. Billed in GBP.' WHERE id = 8;
UPDATE tblproducts SET description = 'Apple Music integration for your Nexlify panel. Requires an active panel license. Billed in GBP.' WHERE id = 9;
UPDATE tblproducts SET description = 'Deezer integration for your Nexlify panel. Requires an active panel license. Billed in GBP.' WHERE id = 10;
UPDATE tblproducts SET description = 'YouTube Music integration for your Nexlify panel. Requires an active panel license. Billed in GBP.' WHERE id = 11;
UPDATE tblproducts SET description = 'Statistics and analytics plugin for your Nexlify panel. Requires an active panel license. Billed in GBP.' WHERE id = 12;
-- GBP only: disable USD storefront currency
UPDATE tblcurrencies SET `default` = 0 WHERE id = 1;
UPDATE tblcurrencies SET `default` = 1 WHERE id = 2;

-- Upsert GBP pricing (currency 2). Setup fees = 0.
-- Panels 1-3
INSERT INTO tblpricing (type, currency, relid, msetupfee, qsetupfee, ssetupfee, asetupfee, bsetupfee, tsetupfee, monthly, quarterly, semiannually, annually, biennially, triennially)
VALUES ('product', 2, 1, 0,0,0,0,0,0, 50.00, 135.00, -1, 500.00, -1, -1)
ON DUPLICATE KEY UPDATE monthly=VALUES(monthly), quarterly=VALUES(quarterly), annually=VALUES(annually);

INSERT INTO tblpricing (type, currency, relid, msetupfee, qsetupfee, ssetupfee, asetupfee, bsetupfee, tsetupfee, monthly, quarterly, semiannually, annually, biennially, triennially)
VALUES ('product', 2, 2, 0,0,0,0,0,0, 150.00, 405.00, -1, 1500.00, -1, -1)
ON DUPLICATE KEY UPDATE monthly=VALUES(monthly), quarterly=VALUES(quarterly), annually=VALUES(annually);

INSERT INTO tblpricing (type, currency, relid, msetupfee, qsetupfee, ssetupfee, asetupfee, bsetupfee, tsetupfee, monthly, quarterly, semiannually, annually, biennially, triennially)
VALUES ('product', 2, 3, 0,0,0,0,0,0, 350.00, 945.00, -1, 3500.00, -1, -1)
ON DUPLICATE KEY UPDATE monthly=VALUES(monthly), quarterly=VALUES(quarterly), annually=VALUES(annually);

-- Plugins 4-13
INSERT INTO tblpricing (type, currency, relid, msetupfee, qsetupfee, ssetupfee, asetupfee, bsetupfee, tsetupfee, monthly, quarterly, semiannually, annually, biennially, triennially)
VALUES ('product', 2, 4, 0,0,0,0,0,0, 20.00, 54.00, -1, 200.00, -1, -1)
ON DUPLICATE KEY UPDATE monthly=VALUES(monthly), quarterly=VALUES(quarterly), annually=VALUES(annually);

INSERT INTO tblpricing (type, currency, relid, msetupfee, qsetupfee, ssetupfee, asetupfee, bsetupfee, tsetupfee, monthly, quarterly, semiannually, annually, biennially, triennially)
VALUES ('product', 2, 5, 0,0,0,0,0,0, 18.00, 48.60, -1, 180.00, -1, -1)
ON DUPLICATE KEY UPDATE monthly=VALUES(monthly), quarterly=VALUES(quarterly), annually=VALUES(annually);

INSERT INTO tblpricing (type, currency, relid, msetupfee, qsetupfee, ssetupfee, asetupfee, bsetupfee, tsetupfee, monthly, quarterly, semiannually, annually, biennially, triennially)
VALUES ('product', 2, 6, 0,0,0,0,0,0, 15.00, 40.50, -1, 150.00, -1, -1)
ON DUPLICATE KEY UPDATE monthly=VALUES(monthly), quarterly=VALUES(quarterly), annually=VALUES(annually);

INSERT INTO tblpricing (type, currency, relid, msetupfee, qsetupfee, ssetupfee, asetupfee, bsetupfee, tsetupfee, monthly, quarterly, semiannually, annually, biennially, triennially)
VALUES ('product', 2, 7, 0,0,0,0,0,0, 12.00, 32.40, -1, 120.00, -1, -1)
ON DUPLICATE KEY UPDATE monthly=VALUES(monthly), quarterly=VALUES(quarterly), annually=VALUES(annually);

INSERT INTO tblpricing (type, currency, relid, msetupfee, qsetupfee, ssetupfee, asetupfee, bsetupfee, tsetupfee, monthly, quarterly, semiannually, annually, biennially, triennially)
VALUES ('product', 2, 8, 0,0,0,0,0,0, 10.00, 27.00, -1, 100.00, -1, -1)
ON DUPLICATE KEY UPDATE monthly=VALUES(monthly), quarterly=VALUES(quarterly), annually=VALUES(annually);

INSERT INTO tblpricing (type, currency, relid, msetupfee, qsetupfee, ssetupfee, asetupfee, bsetupfee, tsetupfee, monthly, quarterly, semiannually, annually, biennially, triennially)
VALUES ('product', 2, 9, 0,0,0,0,0,0, 10.00, 27.00, -1, 100.00, -1, -1)
ON DUPLICATE KEY UPDATE monthly=VALUES(monthly), quarterly=VALUES(quarterly), annually=VALUES(annually);

INSERT INTO tblpricing (type, currency, relid, msetupfee, qsetupfee, ssetupfee, asetupfee, bsetupfee, tsetupfee, monthly, quarterly, semiannually, annually, biennially, triennially)
VALUES ('product', 2, 10, 0,0,0,0,0,0, 8.00, 21.60, -1, 80.00, -1, -1)
ON DUPLICATE KEY UPDATE monthly=VALUES(monthly), quarterly=VALUES(quarterly), annually=VALUES(annually);

INSERT INTO tblpricing (type, currency, relid, msetupfee, qsetupfee, ssetupfee, asetupfee, bsetupfee, tsetupfee, monthly, quarterly, semiannually, annually, biennially, triennially)
VALUES ('product', 2, 11, 0,0,0,0,0,0, 10.00, 27.00, -1, 100.00, -1, -1)
ON DUPLICATE KEY UPDATE monthly=VALUES(monthly), quarterly=VALUES(quarterly), annually=VALUES(annually);

INSERT INTO tblpricing (type, currency, relid, msetupfee, qsetupfee, ssetupfee, asetupfee, bsetupfee, tsetupfee, monthly, quarterly, semiannually, annually, biennially, triennially)
VALUES ('product', 2, 12, 0,0,0,0,0,0, 8.00, 21.60, -1, 80.00, -1, -1)
ON DUPLICATE KEY UPDATE monthly=VALUES(monthly), quarterly=VALUES(quarterly), annually=VALUES(annually);
