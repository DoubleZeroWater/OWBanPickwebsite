from __future__ import annotations

import json
import re
from html import unescape
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


SOURCE_URL = "https://liquipedia.net/overwatch/Portal:Maps"
ROOT = Path(__file__).resolve().parent.parent
MAP_DIR = ROOT / "static" / "maps"
MANIFEST_PATH = ROOT / "backend" / "data" / "maps.json"
MODES = ["Control", "Escort", "Flashpoint", "Hybrid", "Push"]
USER_AGENT = "Mozilla/5.0 OWBanPickwebsite map asset scraper"


def main() -> None:
    MAP_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)

    html = fetch_text(SOURCE_URL)
    manifest: dict[str, list[dict[str, str]]] = {}

    for index, mode in enumerate(MODES):
        next_mode = MODES[index + 1] if index + 1 < len(MODES) else None
        section = extract_mode_section(html, mode, next_mode)
        regular_section = section.split("Stadium Exclusive", 1)[0]
        manifest[mode] = extract_maps(regular_section, mode)

    for maps in manifest.values():
        for map_info in maps:
            download_image(map_info["sourceImageUrl"], MAP_DIR / map_info["fileName"])

    MANIFEST_PATH.write_text(
        json.dumps(
            {
                "source": SOURCE_URL,
                "modes": MODES,
                "maps": manifest,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    total = sum(len(maps) for maps in manifest.values())
    print(f"Downloaded {total} maps into {MAP_DIR}")


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def extract_mode_section(html: str, mode: str, next_mode: str | None) -> str:
    title_marker = f'<div class="font-title"><a href="/overwatch/{mode}" title="{mode}">{mode}</a>'
    start = html.index(title_marker)

    if next_mode:
        next_marker = (
            f'<div class="font-title"><a href="/overwatch/{next_mode}" '
            f'title="{next_mode}">{next_mode}</a>'
        )
        end = html.index(next_marker, start + len(title_marker))
    else:
        next_tab_group = re.search(r'</div></div></div>\s*</div><div class="content\d+">', html[start:])
        if not next_tab_group:
            raise ValueError(f"Unable to find end of {mode}")
        end = start + next_tab_group.start()

    return html[start:end]


def extract_maps(section: str, mode: str) -> list[dict[str, str]]:
    pattern = re.compile(
        r'<div class="thumb"[^>]*>.*?'
        r'<a href="(?P<href>[^"]+)" title="(?P<title>[^"]+)">'
        r'<img alt="(?P<alt>[^"]+)" src="(?P<src>[^"]+)"',
        re.S,
    )
    maps: list[dict[str, str]] = []
    seen: set[str] = set()

    for match in pattern.finditer(section):
        name = unescape(match.group("title"))
        if name in seen:
            continue

        image_url = urljoin(SOURCE_URL, unescape(match.group("src")))
        file_name = build_file_name(name, image_url)
        maps.append(
            {
                "mode": mode,
                "nameEn": name,
                "pageUrl": urljoin(SOURCE_URL, unescape(match.group("href"))),
                "sourceImageUrl": image_url,
                "imageUrl": f"/static/maps/{file_name}",
                "fileName": file_name,
            }
        )
        seen.add(name)

    return maps


def build_file_name(name: str, image_url: str) -> str:
    path = urlparse(image_url).path
    source_name = path.rsplit("/", 1)[-1]
    source_name = re.sub(r"^\d+px-", "", source_name)
    suffix = Path(source_name).suffix.lower() or ".jpg"
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{slug}{suffix}"


def download_image(url: str, path: Path) -> None:
    if path.exists() and path.stat().st_size > 0:
        return

    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        path.write_bytes(response.read())


if __name__ == "__main__":
    main()
