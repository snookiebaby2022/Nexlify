#!/bin/bash
PGPASSWORD=nexlify psql -h 127.0.0.1 -U nexlify -d nexlify_marketing -t -A -c 'SELECT passwordHash FROM "User" LIMIT 2;'
