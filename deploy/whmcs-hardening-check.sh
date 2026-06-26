#!/bin/bash
mysql whmcs -e "SHOW TABLES LIKE '%storage%';"
mysql whmcs -e "SHOW TABLES LIKE '%asset%';"
mysql whmcs -e "SELECT * FROM tblstorageconfiguration_settings LIMIT 20;" 2>/dev/null || true
mysql whmcs -e "SELECT * FROM tblstorageconfigurations LIMIT 5;" 2>/dev/null || true
mysql whmcs -e "SELECT setting, value FROM tblconfiguration WHERE setting LIKE '%Template%' OR setting LIKE '%Order%' OR setting LIKE '%Updater%' OR setting LIKE '%Update%';"
