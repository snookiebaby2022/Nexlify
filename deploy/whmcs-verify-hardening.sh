#!/bin/bash
mysql whmcs -e "SELECT setting, value FROM tblconfiguration WHERE setting='OrderFormTemplate';"
mysql whmcs -e "SELECT id, name, settings FROM tblstorageconfigurations;"
crontab -l 2>/dev/null || echo "no crontab"
php -m | grep -i soap
