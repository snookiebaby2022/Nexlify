<?php
declare(strict_types=1);
/** XUI epg.php — same as xmltv (full guide via Next). */
require __DIR__ . '/lib.php';
require __DIR__ . '/proxy_next_lib.php';
\Nexlify\PanelPhp\proxy_to_next('/xmltv.php', 180);
