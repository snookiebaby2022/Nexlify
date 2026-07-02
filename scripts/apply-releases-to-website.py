#!/usr/bin/env python3
"""Merge src/lib/panel-releases.json into nexlify-web src/lib/updates.ts (run on VPS)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

UPDATES_TS = Path("/var/www/nexlify/src/lib/updates.ts")
FEED_JSON = Path("/tmp/panel-releases.json")


def ts_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=True)


def release_to_ts(release: dict) -> str:
    lines = [
        "  {",
        f"    version: {ts_string(release['version'])},",
        f"    date: {ts_string(release['date'])},",
        f"    channel: {ts_string(release['channel'])},",
        "    summary:",
        f"      {ts_string(release.get('summary', ''))},",
    ]
    notes = release.get("notes") or []
    if notes:
        lines.append("    notes: [")
        for note in notes:
            lines.append(f"      {ts_string(note)},")
        lines.append("    ],")
    lines.append("    changelog: [")
    for item in release.get("changelog") or []:
        lines.append(f"      {ts_string(item)},")
    lines.append("    ],")
    lines.append("    fixes: [")
    for item in release.get("fixes") or []:
        lines.append(f"      {ts_string(item)},")
    lines.append("    ],")
    lines.append("  },")
    return "\n".join(lines)


def strip_release_blocks(text: str, versions: set[str]) -> str:
    for version in versions:
        pattern = re.compile(
            rf"\n  \{{\n    version: \"{re.escape(version)}\",.*?\n  \}},",
            re.DOTALL,
        )
        text = pattern.sub("", text)
    return text


def main() -> int:
    if not FEED_JSON.is_file():
        print(f"Missing {FEED_JSON}", file=sys.stderr)
        return 1

    feed = json.loads(FEED_JSON.read_text(encoding="utf-8"))
    canonical = feed.get("releases") or []
    web_json = Path("/var/www/nexlify/src/lib/panel-releases.json")
    web_json.parent.mkdir(parents=True, exist_ok=True)
    web_json.write_text(FEED_JSON.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"Wrote {web_json} (latest {feed.get('latestVersion')})")

    if not UPDATES_TS.is_file():
        print(f"Missing {UPDATES_TS} — JSON feed updated only", file=sys.stderr)
        return 0

    text = UPDATES_TS.read_text(encoding="utf-8")

    if 'import releasesJson from "./panel-releases.json"' in text or "from './panel-releases.json'" in text:
        print(f"updates.ts uses JSON import — {len(canonical)} release(s) synced via panel-releases.json")
        return 0

    versions = {r["version"] for r in canonical}
    marker = "export const PANEL_RELEASES: PanelRelease[] = ["
    if marker not in text:
        print("PANEL_RELEASES marker not found and updates.ts is not JSON-import style", file=sys.stderr)
        return 1

    text = strip_release_blocks(text, versions)
    prepend = "\n".join(release_to_ts(r) for r in canonical) + "\n"
    text = text.replace(marker + "\n", marker + "\n" + prepend, 1)
    UPDATES_TS.write_text(text, encoding="utf-8")
    print(
        f"Merged {len(canonical)} canonical release(s) into updates.ts "
        f"(latest {feed.get('latestVersion')})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
