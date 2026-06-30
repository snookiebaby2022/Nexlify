#!/usr/bin/env python3
"""Apply marketing SEO files to nexlify-web (run on VPS after SFTP upload)."""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

ROOT = Path("/var/www/nexlify")
DROP_IN = Path("/tmp/marketing-seo-drop-in")

FILE_MAP: list[tuple[Path, Path]] = [
    (DROP_IN / "src/lib/seo.ts", ROOT / "src/lib/seo.ts"),
    (DROP_IN / "src/app/layout.tsx", ROOT / "src/app/layout.tsx"),
    (DROP_IN / "src/app/page.tsx", ROOT / "src/app/page.tsx"),
    (DROP_IN / "src/app/sitemap.ts", ROOT / "src/app/sitemap.ts"),
    (DROP_IN / "src/app/robots.ts", ROOT / "src/app/robots.ts"),
    (DROP_IN / "src/app/pricing/page.tsx", ROOT / "src/app/pricing/page.tsx"),
    (DROP_IN / "src/app/install/page.tsx", ROOT / "src/app/install/page.tsx"),
    (DROP_IN / "src/app/register/page.tsx", ROOT / "src/app/register/page.tsx"),
    (DROP_IN / "src/app/features/page.tsx", ROOT / "src/app/features/page.tsx"),
    (DROP_IN / "src/app/help/page.tsx", ROOT / "src/app/help/page.tsx"),
    (DROP_IN / "src/app/demo/page.tsx", ROOT / "src/app/demo/page.tsx"),
    (DROP_IN / "src/components/Hero.tsx", ROOT / "src/components/Hero.tsx"),
    (DROP_IN / "src/components/HomeSeoContent.tsx", ROOT / "src/components/HomeSeoContent.tsx"),
    (DROP_IN / "src/components/JsonLd.tsx", ROOT / "src/components/JsonLd.tsx"),
    (DROP_IN / "src/components/BreadcrumbJsonLd.tsx", ROOT / "src/components/BreadcrumbJsonLd.tsx"),
    (DROP_IN / "src/components/PricingJsonLd.tsx", ROOT / "src/components/PricingJsonLd.tsx"),
    (DROP_IN / "src/components/FaqJsonLd.tsx", ROOT / "src/components/FaqJsonLd.tsx"),
    (
        DROP_IN / "public/nexlifyindexnow2026seokey48chars00.txt",
        ROOT / "public/nexlifyindexnow2026seokey48chars00.txt",
    ),
]

MARKERS = {
    "layout.tsx": "hreflangAlternates",
    "page.tsx": "HomeSeoContent",
    "Hero.tsx": "best reseller panel",
    "JsonLd.tsx": "SoftwareApplication",
    "HomeSeoContent.tsx": "GBP and USD checkout",
    "seo.ts": "hreflangAlternates",
    "sitemap.ts": "sitemapLanguages",
}


def route_from_page(path: Path) -> str | None:
    rel = path.relative_to(ROOT / "src/app")
    if "[" in str(rel):
        return None
    parts = list(rel.parts)
    if parts[-1] != "page.tsx":
        return None
    segments = parts[:-1]
    return "/" if not segments else "/" + "/".join(segments)


def ensure_seo_import(text: str) -> str:
    if "hreflangAlternates" in text:
        return text

    existing = re.search(r'import \{([^}]+)\} from "@/lib/seo";', text)
    if existing:
        names = [n.strip() for n in existing.group(1).split(",")]
        if "hreflangAlternates" not in names:
            names.insert(0, "hreflangAlternates")
        replacement = f'import {{ {", ".join(names)} }} from "@/lib/seo";'
        return text[: existing.start()] + replacement + text[existing.end() :]

    insert = 'import { hreflangAlternates } from "@/lib/seo";\n'
    m = re.search(r"^(import .+;\n)+", text)
    if m:
        return text[: m.end()] + insert + text[m.end() :]
    return insert + text


def patch_inline_metadata(path: Path, route: str) -> bool:
    text = path.read_text(encoding="utf-8")
    if "pageMetadata(" in text or "hreflangAlternates(" in text:
        return False
    if "export const metadata" not in text:
        return False

    text = ensure_seo_import(text)
    if f'alternates: hreflangAlternates("{route}")' in text:
        path.write_text(text, encoding="utf-8")
        return False

    text = re.sub(
        r"export const metadata = \{",
        (
            "export const metadata = {\n"
            f'  alternates: hreflangAlternates("{route}"),'
        ),
        text,
        count=1,
    )
    path.write_text(text, encoding="utf-8")
    print(f"Patched hreflang on {path.relative_to(ROOT)} ({route})")
    return True


def add_metadata_export(path: Path, route: str) -> bool:
    text = path.read_text(encoding="utf-8")
    if "export const metadata" in text or "pageMetadata(" in text:
        return False

    text = ensure_seo_import(text)
    block = (
        f'export const metadata = {{\n'
        f'  alternates: hreflangAlternates("{route}"),\n'
        f"}};\n\n"
    )
    m = re.search(r"^(import .+;\n)+", text)
    if m:
        text = text[: m.end()] + block + text[m.end() :]
    else:
        text = block + text
    path.write_text(text, encoding="utf-8")
    print(f"Added hreflang metadata to {path.relative_to(ROOT)} ({route})")
    return True


def patch_all_page_hreflang() -> None:
    for page in sorted((ROOT / "src/app").rglob("page.tsx")):
        route = route_from_page(page)
        if route is None:
            continue
        if not patch_inline_metadata(page, route):
            add_metadata_export(page, route)


def copy_files() -> None:
    for src, dest in FILE_MAP:
        if not src.is_file():
            raise SystemExit(f"Missing drop-in file: {src}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        print(f"Installed {dest.relative_to(ROOT)}")


def verify_markers() -> None:
    checks = {
        ROOT / "src/lib/seo.ts": "hreflangAlternates",
        ROOT / "src/app/layout.tsx": "hreflangAlternates",
        ROOT / "src/app/page.tsx": "HomeSeoContent",
        ROOT / "src/components/Hero.tsx": "best reseller panel",
        ROOT / "src/components/JsonLd.tsx": "SoftwareApplication",
        ROOT / "src/components/HomeSeoContent.tsx": "GBP and USD checkout",
        ROOT / "src/app/sitemap.ts": "sitemapLanguages",
    }
    for path, marker in checks.items():
        text = path.read_text(encoding="utf-8")
        if marker not in text:
            raise SystemExit(f"SEO marker {marker!r} missing in {path}")
        print(f"Verified {path.name}: {marker!r}")


def main() -> int:
    if not DROP_IN.is_dir():
        print(f"Missing drop-in directory {DROP_IN}", file=sys.stderr)
        return 1
    copy_files()
    patch_all_page_hreflang()
    verify_markers()
    print("Marketing SEO patch complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
