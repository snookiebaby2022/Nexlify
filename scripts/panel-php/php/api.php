<?php
declare(strict_types=1);
/** XUI api.php — admin/reseller JSON API (Next /api.php → /api/v1). */
require __DIR__ . '/lib.php';
require __DIR__ . '/proxy_next_lib.php';
\Nexlify\PanelPhp\proxy_to_next('/api.php', 60);
