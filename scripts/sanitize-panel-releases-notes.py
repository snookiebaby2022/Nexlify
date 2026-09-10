#!/usr/bin/env python3
"""Sanitize user-facing panel release notes (no domains, URLs, XUI, 1-Stream)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "src" / "lib" / "panel-releases.json"

COPY_PATHS = [
    ROOT / "marketing-drop-in" / "src" / "lib" / "panel-releases.json",
    ROOT / "marketing-drop-in" / "public" / "panel-releases.json",
]

URL_RE = re.compile(r"https?://[^\s)\]\"']+", re.I)
DOMAIN_RE = re.compile(
    r"\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:live|win|store|site|com|net|org|io|dev)(?::\d+)?\b",
    re.I,
)
IP_PORT_RE = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b")
COMPETITOR_RE = re.compile(
    r"\b1-stream\s*/\s*xui\.?one\b|\b1-stream\b|\b1-stream\b|\bxui\.?one\b|"
    r"\bxui\s*/\s*nxt\b|\bxui-style\b|\bxui\b",
    re.I,
)


def sanitize_line(text: str) -> str:
    if not isinstance(text, str) or not text.strip():
        return ""
    s = text
    s = s.replace(".env", "<<DOTENV>>")
    s = re.sub(r"\bdarkcdn\b", "custom", s, flags=re.I)
    s = re.sub(r"http://\s+and\s+https://", "HTTP and HTTPS", s, flags=re.I)
    s = re.sub(r"include\s+http://\s+or\s+https://", "include HTTP or HTTPS", s, flags=re.I)
    s = re.sub(r"with\s+http://\s+or\s+https://", "with HTTP or HTTPS", s, flags=re.I)
    s = re.sub(r"https://(?=[\s,)])", "HTTPS ", s, flags=re.I)
    s = re.sub(r"http://(?=[\s,)])", "HTTP ", s, flags=re.I)
    s = URL_RE.sub("", s)
    s = DOMAIN_RE.sub("your panel", s)
    s = IP_PORT_RE.sub("the media edge", s)
    s = COMPETITOR_RE.sub("", s)
    s = re.sub(r"^live:\s*", "Live: ", s, flags=re.I)
    s = re.sub(r"(?:your panel(?:\s+and\s+)?)+", "Some panel hostnames", s, flags=re.I)
    s = re.sub(r"\s+/\s+", " ", s)
    s = re.sub(r"\(\s*/\s*", "(", s)
    s = re.sub(r"\s*/\s*\)", ")", s)
    s = re.sub(r"\s{2,}", " ", s)
    s = re.sub(r"\s+([,.;:!?])", r"\1", s)
    s = re.sub(r"\(\s*\)", "", s)
    s = re.sub(r"\s—\s—\s", " — ", s)
    s = s.strip(" -—/|")
    s = s.strip()
    s = s.replace("<<DOTENV>>", ".env")
    s = re.sub(r"\bfrom\.env\b", "from .env", s, flags=re.I)
    if len(s) < 12:
        return ""
    return s


def sanitize_list(items: list | None) -> list:
    if not items:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        cleaned = sanitize_line(str(item))
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        out.append(cleaned)
    return out


def sanitize_release(release: dict) -> dict:
    r = dict(release)
    summary = sanitize_line(str(r.get("summary") or ""))
    if not summary:
        summary = f"Panel update v{r.get('version', '')}."
    r["summary"] = summary
    r["changelog"] = sanitize_list(r.get("changelog"))
    r["fixes"] = sanitize_list(r.get("fixes"))
    notes = sanitize_list(r.get("notes"))
    if notes:
        r["notes"] = notes
    elif "notes" in r:
        del r["notes"]
    if "downloadUrl" in r:
        del r["downloadUrl"]
    return r


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else JSON_PATH
    data = json.loads(path.read_text(encoding="utf-8"))
    data["releases"] = [sanitize_release(r) for r in data.get("releases", [])]
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    path.write_text(text, encoding="utf-8")
    for copy in COPY_PATHS:
        copy.parent.mkdir(parents=True, exist_ok=True)
        copy.write_text(text, encoding="utf-8")
    print(f"Sanitized {len(data['releases'])} releases -> {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
