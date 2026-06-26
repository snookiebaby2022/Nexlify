<?php
/**
 * Redirect customers back to nexlify.live after WHMCS checkout completes.
 * Complements returnurl on cart/store links from the marketing site.
 */
if (!defined('WHMCS')) {
    die('This file cannot be accessed directly');
}

add_hook('ShoppingCartCheckoutCompletePage', 1, function () {
    $default = 'https://nexlify.live/order/success';
    $return = $_SESSION['returnurl'] ?? $default;

    if (!is_string($return) || !filter_var($return, FILTER_VALIDATE_URL)) {
        $return = $default;
    }

    $host = parse_url($return, PHP_URL_HOST);
    if (!in_array($host, ['nexlify.live', 'www.nexlify.live'], true)) {
        $return = $default;
    }

    $escaped = htmlspecialchars($return, ENT_QUOTES, 'UTF-8');

    return <<<HTML
<div class="alert alert-info text-center" style="margin-top:1rem">
  <p>Redirecting you back to Nexlify in 5 seconds&hellip;</p>
  <p><a href="{$escaped}">Continue now</a></p>
</div>
<meta http-equiv="refresh" content="5;url={$escaped}" />
HTML;
});
