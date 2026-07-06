#!/bin/bash
PGPASSWORD=nexlify psql -h 127.0.0.1 -U nexlify -d nexlify_marketing << 'EOSQL'
UPDATE public."User" SET "passwordHash" = '$2b$12$4pxZwW5gzriXRrpEPb8bE.mEa2w/zXit8gKX96.DCo459MDCo2RC.' WHERE email = 'admin@nexlify.live';
EOSQL