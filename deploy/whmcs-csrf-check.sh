#!/bin/bash
mysql whmcs -e "SELECT setting, value FROM tblconfiguration WHERE setting IN ('SystemURL','Domain','DisableSessionIPCheck','TrustedProxies');"
php -i 2>/dev/null | grep -E 'session.save_path|session.cookie'
