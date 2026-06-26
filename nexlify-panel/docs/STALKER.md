# Stalker / MAG portal

Portal URL: `/stalker_portal/server/load.php` (MAG boxes often use `/c/` as the entry page).

## Geo & security on handshake

For guarded actions (`handshake`, `get_profile`, `get_main_info`, `get_categories`, `get_ordered_list`, `create_link`), Nexlify applies the same rules as live playback:

- Line IP lock
- Panel blocklists (IP, ASN, ISP, user-agent)
- Line country allow/block lists
- Optional VPN/hosting block (Settings → Geo)
- Max connections and playback rate limits

On denial, Stalker receives `{ authorized: 0, error: "..." }` and an STB event is logged (`denied_handshake`, etc.).

Configure country lists on **Admin → Lines → Add/Edit line**.
