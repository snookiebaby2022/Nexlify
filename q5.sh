#!/bin/bash
PGPASSWORD=nexlify psql -h 127.0.0.1 -U nexlify -d nexlify_marketing -t -A -c "SELECT email, substring(\"passwordHash\" from 1 for 30) FROM public.\"User\";"
