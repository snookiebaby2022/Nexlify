#!/usr/bin/env python3
"""Stream-copy XUI catalog tables out of a full dump without buffering giant lines."""
import os, re, sys

src = sys.argv[1] if len(sys.argv) > 1 else "/tmp/nexlify-migrate-1787751507310-mamo8hx6p3n.sql"
dst = sys.argv[2] if len(sys.argv) > 2 else "/tmp/xui-catalog-only.sql"
keep = {
    "streams",
    "streams_categories",
    "stream_categories",
    "categories",
    "bouquets",
    "streams_series",
    "streams_episodes",
}

# Start of a new SQL statement (mysqldump).
start_re = re.compile(
    br"(?:/\*!40000 )?(?:DROP TABLE IF EXISTS|CREATE TABLE|LOCK TABLES|INSERT INTO|ALTER TABLE|UNLOCK TABLES)\s+(?:IF NOT EXISTS\s+)?[`']?(\w+)",
    re.I,
)

current = None
kept = set()
insert_bytes = {n: 0 for n in keep}
written = 0

os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
with open(src, "rb") as inf, open(dst, "wb") as out:
    out.write(b"-- slim XUI.one catalog extract\n")
    leftover = b""
    while True:
        chunk = inf.read(4 * 1024 * 1024)
        data = leftover + (chunk or b"")
        if not data:
            break
        matches = list(start_re.finditer(data))
        if not matches:
            if current in keep:
                out.write(data if chunk else leftover)
                written += len(data if chunk else leftover)
                if current:
                    insert_bytes[current] = insert_bytes.get(current, 0) + len(data)
            leftover = b"" if not chunk else data[-64:]
            if not chunk:
                break
            continue
        # bytes before first match belong to previous statement
        pre = data[: matches[0].start()]
        if current in keep and pre:
            out.write(pre)
            written += len(pre)
        for i, m in enumerate(matches):
            name = m.group(1).decode("ascii", "replace").lower()
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else (len(data) if not chunk else None)
            if end is None:
                leftover = data[start:]
                current = name
                break
            stmt = data[start:end]
            current = name
            leftover = b""
            if name in keep:
                out.write(stmt)
                written += len(stmt)
                kept.add(name)
                if stmt.lstrip().upper().startswith(b"INSERT INTO"):
                    insert_bytes[name] = insert_bytes.get(name, 0) + len(stmt)
        else:
            leftover = leftover
        if not chunk:
            if leftover and current in keep:
                out.write(leftover)
                written += len(leftover)
            break

print("src", src)
print("dst", dst, written)
print("tables", sorted(kept))
print("insert_bytes", {k: v for k, v in insert_bytes.items() if v})
