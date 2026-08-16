#!/usr/bin/env python3
"""Extract XUI users.username→password from a MySQL dump."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def parse_values_tuples(s: str) -> list[list[str | None]]:
    rows: list[list[str | None]] = []
    i = 0
    n = len(s)
    while i < n:
        while i < n and s[i] in " \n\r\t,":
            i += 1
        if i >= n:
            break
        if s[i] != "(":
            break
        i += 1
        fields: list[str | None] = []
        cur: list[str] = []
        in_q = False
        esc = False
        while i < n:
            ch = s[i]
            if in_q:
                if esc:
                    cur.append(ch)
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == "'":
                    if i + 1 < n and s[i + 1] == "'":
                        cur.append("'")
                        i += 1
                    else:
                        in_q = False
                else:
                    cur.append(ch)
            else:
                if ch == "'":
                    in_q = True
                elif ch == ",":
                    val = "".join(cur).strip()
                    fields.append(None if val.upper() == "NULL" else val)
                    cur = []
                elif ch == ")":
                    val = "".join(cur).strip()
                    fields.append(None if val.upper() == "NULL" else val)
                    rows.append(fields)
                    i += 1
                    break
                else:
                    cur.append(ch)
            i += 1
    return rows


def extract_inserts(path: Path, table: str) -> list[list[str | None]]:
    rows: list[list[str | None]] = []
    prefix = f"INSERT INTO `{table}` VALUES"
    with path.open("r", errors="ignore") as f:
        buf: str | None = None
        for line in f:
            if buf is None:
                if line.startswith(prefix):
                    buf = line[len(prefix) :]
                    if buf.rstrip().endswith(";"):
                        rows.extend(parse_values_tuples(buf.rstrip()[:-1]))
                        buf = None
                continue
            buf += line
            if line.rstrip().endswith(";"):
                rows.extend(parse_values_tuples(buf.rstrip()[:-1]))
                buf = None
    return rows


def main() -> None:
    dump = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/nexlify-migrate-1786792197896-hsj8buugcmq.sql")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/xui-users-passwords.json")
    users = extract_inserts(dump, "users")
    print(f"parsed users: {len(users)}")
    mapping: dict[str, str] = {}
    bcrypt = md5 = plain = empty = other = 0
    for u in users:
        if len(u) < 3:
            continue
        username = u[1]
        password = u[2]
        if not username:
            continue
        pw = password or ""
        if not pw:
            empty += 1
        elif pw.startswith("$2"):
            bcrypt += 1
        elif re.fullmatch(r"[a-fA-F0-9]{32}", pw):
            md5 += 1
        elif len(pw) < 64:
            plain += 1
        else:
            other += 1
        if pw:
            mapping[str(username)] = str(pw)
    print(json.dumps({"bcrypt": bcrypt, "md5": md5, "plainish": plain, "empty": empty, "other": other}))
    sample = [
        {"username": u[1], "password": u[2], "email": u[3] if len(u) > 3 else None}
        for u in users[:12]
    ]
    print(json.dumps(sample, indent=2))
    out.write_text(json.dumps(mapping))
    print(f"wrote {len(mapping)} -> {out}")


if __name__ == "__main__":
    main()
