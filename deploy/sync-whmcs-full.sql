-- Full WHMCS ↔ website sync (products 1–16, GBP, store slugs)

-- Plans: names + descriptions match nexlify.live
UPDATE tblproducts SET name='Starter', slug='starter-package',
  description='Everything you need to launch — without the enterprise price tag. 1 main panel + 2 load balancers. Billed in GBP.'
WHERE id=1;
UPDATE tblproducts SET name='Main', slug='main-package',
  description='For operators who are growing fast and need room to scale. 1 main panel + 10 load balancers. Billed in GBP.'
WHERE id=2;
UPDATE tblproducts SET name='Top Tier', slug='top-tier',
  description='The complete Nexlify stack — every plugin unlocked, maximum capacity. 1 main panel + 50 load balancers. Billed in GBP.'
WHERE id=3;

-- Plugins 4–13
UPDATE tblproducts SET name='Plex Plugin', slug='plex-plugin',
  description='Import your Plex library as streamable movies and series on your panel. Requires an active panel license.'
WHERE id=4;
UPDATE tblproducts SET name='Emby Plugin', slug='emby-plugin',
  description='Sync Emby movies and shows into bouquets your subscribers can browse. Requires an active panel license.'
WHERE id=5;
UPDATE tblproducts SET name='Jellyfin Plugin', slug='jellyfin-plugin',
  description='Self-hosted Jellyfin libraries, imported as panel streams. Requires an active panel license.'
WHERE id=6;
UPDATE tblproducts SET name='YouTube Plugin', slug='youtube-plugin',
  description='Pull YouTube channels and videos onto your lines as live content. Requires an active panel license.'
WHERE id=7;
UPDATE tblproducts SET name='Spotify Plugin', slug='spotify-plugin',
  description='Turn Spotify playlists into tune-in channels for your subscribers. Requires an active panel license.'
WHERE id=8;
UPDATE tblproducts SET name='Apple Music Plugin', slug='apple-music-plugin',
  description='Import Apple Music playlists and stream them through your panel. Requires an active panel license.'
WHERE id=9;
UPDATE tblproducts SET name='Deezer Plugin', slug='deezer-plugin',
  description='Import Deezer playlists as tune-in channels — full tracks via music relay. Requires an active panel license.'
WHERE id=10;
UPDATE tblproducts SET name='YouTube Music Plugin', slug='youtube-music-plugin',
  description='YouTube Music content on your lines — great for music-focused bouquets. Requires an active panel license.'
WHERE id=11;
UPDATE tblproducts SET name='Statistics Plugin', slug='statistics-plugin',
  description='Real-time usage stats so you know what your subscribers are watching. Requires an active panel license.'
WHERE id=12;
-- Product 13 (Proxy Plugins) retired — built into IPTV panel
UPDATE tblproducts SET name='Proxy Plugins', slug='proxy-plugins',
  description='Retired — proxy tooling is included with the Nexlify panel.',
  hidden=1, retired=1
WHERE id=13;

-- Bundles 14–16 (visible, same module as plugins)
UPDATE tblproducts SET name='Media Pack', slug='media-pack',
  description='Stream movies and series from Plex, Emby, and Jellyfin — one subscription, three libraries. Requires an active panel license.'
WHERE id=14;
UPDATE tblproducts SET name='Music Pack', slug='music-pack',
  description='Bring music and video content onto your lines — YouTube, Spotify, Apple Music, Deezer & more. Requires an active panel license.'
WHERE id=15;
UPDATE tblproducts SET name='Full Plugin Pack', slug='full-plugin-pack',
  description='Unlock the full integration suite — media servers, music, and analytics in one go. Requires an active panel license.'
WHERE id=16;

-- Module + visibility for all sellable products (13 = retired proxy plugin)
UPDATE tblproducts SET
  hidden=0, retired=0, type='other', showdomainoptions=0,
  servertype='streambilling', servergroup=1, paytype='recurring', autosetup='payment'
WHERE id BETWEEN 1 AND 16 AND id <> 13;

UPDATE tblproducts SET gid=1 WHERE id BETWEEN 1 AND 3;
UPDATE tblproducts SET gid=2 WHERE id BETWEEN 4 AND 16;

-- Store slugs (WHMCS uses tblproducts_slugs for /store/ URLs)
UPDATE tblproducts_slugs SET slug='starter-package', active=1 WHERE product_id=1 AND group_id=1;
UPDATE tblproducts_slugs SET slug='main-package', active=1 WHERE product_id=2 AND group_id=1;
UPDATE tblproducts_slugs SET slug='top-tier', active=1 WHERE product_id=3 AND group_id=1;

UPDATE tblproducts_slugs SET slug='plex-plugin', active=1 WHERE product_id=4 AND group_id=2;
UPDATE tblproducts_slugs SET slug='emby-plugin', active=1 WHERE product_id=5 AND group_id=2;
UPDATE tblproducts_slugs SET slug='jellyfin-plugin', active=1 WHERE product_id=6 AND group_id=2;
UPDATE tblproducts_slugs SET slug='youtube-plugin', active=1 WHERE product_id=7 AND group_id=2;
UPDATE tblproducts_slugs SET slug='spotify-plugin', active=1 WHERE product_id=8 AND group_id=2;
UPDATE tblproducts_slugs SET slug='apple-music-plugin', active=1 WHERE product_id=9 AND group_id=2;
UPDATE tblproducts_slugs SET slug='deezer-plugin', active=1 WHERE product_id=10 AND group_id=2;
UPDATE tblproducts_slugs SET slug='youtube-music-plugin', active=1 WHERE product_id=11 AND group_id=2;
UPDATE tblproducts_slugs SET slug='statistics-plugin', active=1 WHERE product_id=12 AND group_id=2;
UPDATE tblproducts_slugs SET slug='proxy-plugins', active=0 WHERE product_id=13 AND group_id=2;

UPDATE tblproducts_slugs SET slug='media-pack', active=1 WHERE product_id=14 AND group_id=2;
UPDATE tblproducts_slugs SET slug='music-pack', active=1 WHERE product_id=15 AND group_id=2;
UPDATE tblproducts_slugs SET slug='full-plugin-pack', active=1 WHERE product_id=16 AND group_id=2;

-- Deactivate wrong-group slug rows (e.g. plex under nexlify group)
UPDATE tblproducts_slugs SET active=0 WHERE product_id=4 AND group_id=1;

-- GBP-only default currency (USD removed — was selectable in cart with no prices)
DELETE FROM tblpricing WHERE type='product' AND currency=1 AND relid BETWEEN 1 AND 16;
DELETE FROM tblcurrencies WHERE id=1 AND code='USD';
UPDATE tblcurrencies SET `default`=1, prefix='£', suffix='', format=1 WHERE id=2;
