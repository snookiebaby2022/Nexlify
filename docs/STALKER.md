# Stalker / MAG portal

Portal URL: `/c/` (MAG default — serves Stalker API). Alternate: `/stalker_portal/server/load.php`.

## Geo & security on handshake

For guarded actions (`handshake`, `get_profile`, `get_main_info`, `get_categories`, `get_ordered_list`, `create_link`), Nexlify applies the same rules as live playback:

- Line IP lock
- Panel blocklists (IP, ASN, ISP, user-agent)
- Line country allow/block lists
- Optional VPN/hosting block (Settings → Geo)
- Max connections and playback rate limits

On denial, Stalker receives `{ authorized: 0, error: "..." }` and an STB event is logged (`denied_handshake`, etc.).

## Extended MAG portal (v2.0.29+)

Additional Stalker actions for full MAG/TV archive/PVR UI:

- **Modules:** `get_modules`, `get_tv_modules`
- **Channels:** `get_all_channels`, `get_genres`, `get_tv_genres`
- **EPG:** `get_short_epg`, `get_simple_data_table`, `get_week`, `get_epg_info`
- **Playback:** `get_url`, `create_link`
- **PVR:** `get_pvr`, `get_pvr_version`, `create_pvr` / `pvr_add`, `pvr_stop` / `stop_pvr`
- **TV archive:** `get_tv_archive`, `get_tv_archive_day`, `tv_get_archive`
- **Storage:** `get_storages`, `get_localization`

PVR and TV archive recordings use the disk-backed DVR library (`/api/dvr/playback/...`).

Configure country lists on **Admin → Lines → Add/Edit line**.
