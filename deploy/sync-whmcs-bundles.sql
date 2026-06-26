-- Bundle products 14-16: visible, slugs, GBP pricing
UPDATE tblproducts SET
  hidden = 0,
  retired = 0,
  type = 'other',
  showdomainoptions = 0,
  servertype = 'streambilling',
  servergroup = 1,
  gid = 2,
  paytype = 'recurring',
  autosetup = 'payment'
WHERE id IN (14, 15, 16);

UPDATE tblproducts SET slug = 'media-pack' WHERE id = 14;
UPDATE tblproducts SET slug = 'music-pack' WHERE id = 15;
UPDATE tblproducts SET slug = 'full-plugin-pack' WHERE id = 16;

UPDATE tblproducts SET name = 'Media Pack' WHERE id = 14;
UPDATE tblproducts SET name = 'Music Pack' WHERE id = 15;
UPDATE tblproducts SET name = 'Full Plugin Pack' WHERE id = 16;

UPDATE tblproducts SET description = 'Plex + Emby + Jellyfin plugins for your Nexlify panel. Requires an active panel license. Billed in GBP.' WHERE id = 14;
UPDATE tblproducts SET description = 'YouTube + Spotify + Apple Music + Deezer + YouTube Music plugins. Requires an active panel license. Billed in GBP.' WHERE id = 15;
UPDATE tblproducts SET description = 'All Nexlify panel plugins in one bundle. Requires an active panel license. Billed in GBP.' WHERE id = 16;
