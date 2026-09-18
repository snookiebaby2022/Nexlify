<?php
declare(strict_types=1);

/**
 * XMLTV — proxy Next full guide (was empty stub).
 * XUI: xmltv.php rewrites to epg.php; we keep both names.
 */
require __DIR__ . '/lib.php';
require __DIR__ . '/proxy_next_lib.php';
\Nexlify\PanelPhp\proxy_to_next('/xmltv.php', 180);
