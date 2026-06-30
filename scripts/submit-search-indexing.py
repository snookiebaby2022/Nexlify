#!/usr/bin/env python3
"""Notify search engines of sitemap and priority URLs (IndexNow + ping helpers)."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

SITE = "https://nexlify.live"
INDEXNOW_KEY = "nexlifyindexnow2026seokey48chars00"
SITEMAP = f"{SITE}/sitemap.xml"

PRIORITY_URLS = [
    f"{SITE}/",
    f"{SITE}/pricing",
    f"{SITE}/features",
    f"{SITE}/install",
    f"{SITE}/register",
    f"{SITE}/demo",
]


def post_json(url: str, payload: dict) -> tuple[int, str]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")


def submit_indexnow() -> None:
    payload = {
        "host": "nexlify.live",
        "key": INDEXNOW_KEY,
        "keyLocation": f"{SITE}/{INDEXNOW_KEY}.txt",
        "urlList": PRIORITY_URLS,
    }
    status, body = post_json("https://api.indexnow.org/indexnow", payload)
    print(f"IndexNow: HTTP {status}")
    if body.strip():
        print(body.strip())


def ping_bing_sitemap() -> None:
    url = f"https://www.bing.com/indexnow?url={SITEMAP}"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"Bing sitemap ping: HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        print(f"Bing sitemap ping: HTTP {exc.code}")


def main() -> int:
    print(f"Sitemap: {SITEMAP}")
    print("Priority URLs:")
    for u in PRIORITY_URLS:
        print(f"  - {u}")
    print()
    submit_indexnow()
    ping_bing_sitemap()
    print()
    print("Google Search Console (manual — requires your Google login):")
    print(f"  1. Sitemaps: https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Anexlify.live")
    print(f"  2. Submit sitemap URL: {SITEMAP}")
    print("  3. URL Inspection -> Request indexing:")
    for u in (f"{SITE}/pricing", f"{SITE}/features"):
        print(f"     - {u}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
