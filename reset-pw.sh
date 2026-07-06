#!/bin/bash
cd /var/www/nexlify/marketing-drop-in
node -e "
var bcrypt = require('bcryptjs');
var hash = bcrypt.hashSync('NexlifyAdmin2026!', 12);
console.log(hash);
"