from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import time
import unicodedata
import uuid
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Tag

try:
    from backend.catalog import CATALOG_SCHEMA_VERSION, MODES, compute_catalog_hash
except ModuleNotFoundError:
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from backend.catalog import CATALOG_SCHEMA_VERSION, MODES, compute_catalog_hash


ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "static"
DATA_DIR = ROOT / "backend" / "data"
ASSETS_MANIFEST_PATH = DATA_DIR / "assets.json"
MAPS_MANIFEST_PATH = DATA_DIR / "maps.json"

FANDOM_API_URL = "https://overwatch.fandom.com/api.php"
FANDOM_HEROES_URL = "https://overwatch.fandom.com/wiki/Heroes"
FANDOM_HOME_URL = "https://overwatch.fandom.com/wiki/Overwatch_Wiki"
USER_AGENT = "OWBanPickwebsite catalog updater/1.0"
ROLE_ZH = {"Tank": "重装", "Damage": "输出", "Support": "支援"}
TRUSTED_IMAGE_HOSTS = {"static.wikia.nocookie.net"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh bundled Overwatch catalog assets.")
    parser.parse_args()
    stage = ROOT / f".catalog-stage-{uuid.uuid4().hex}"
    try:
        assets = scrape_catalog(stage, "/static", progress=print_progress, deadline=time.monotonic() + 600)
        publish_bundled(stage, assets)
    finally:
        if stage.exists():
            shutil.rmtree(stage)

    map_count = sum(len(items) for items in assets["maps"].values())
    print(f"Prepared {map_count} maps, {len(assets['modeIcons'])} mode icons, {len(assets['heroes'])} heroes.")


def print_progress(stage: str, percent: int, message: str) -> None:
    print(f"[{percent:3d}%] {stage}: {message}", flush=True)


def scrape_catalog(
    output_dir: Path,
    public_prefix: str,
    *,
    progress: Callable[[str, int, str], None] | None = None,
    deadline: float | None = None,
) -> dict[str, Any]:
    report = progress or (lambda _stage, _percent, _message: None)
    for folder in ("maps", "heroes", "modes", "roles"):
        (output_dir / folder).mkdir(parents=True, exist_ok=True)

    report("fetch", 3, "正在读取英雄页面")
    heroes_html = fetch_parsed_page("Heroes", deadline)
    report("fetch", 9, "正在读取地图页面")
    home_html = fetch_parsed_page("Overwatch_Wiki", deadline)

    report("parse", 15, "正在解析正式英雄名单")
    heroes, role_icons = parse_heroes(heroes_html, public_prefix)
    report("parse", 22, "正在解析标准比赛地图")
    maps, mode_icons = parse_maps(home_html, public_prefix)
    validate_parsed_catalog(heroes, maps, mode_icons, role_icons)

    downloads: list[tuple[str, Path]] = []
    for hero in heroes:
        downloads.append((hero["sourceImageUrl"], output_dir / "heroes" / hero["fileName"]))
    for items in maps.values():
        for item in items:
            downloads.append((item["sourceImageUrl"], output_dir / "maps" / item["fileName"]))
    for item in mode_icons.values():
        downloads.append((item["sourceImageUrl"], output_dir / "modes" / item["fileName"]))
    for item in role_icons.values():
        downloads.append((item["sourceImageUrl"], output_dir / "roles" / item["fileName"]))

    for index, (url, path) in enumerate(downloads, start=1):
        download_image(url, path, deadline)
        percent = 25 + round(index / len(downloads) * 68)
        report("download", percent, f"已下载 {index}/{len(downloads)} 个图片")

    assets: dict[str, Any] = {
        "schemaVersion": CATALOG_SCHEMA_VERSION,
        "sources": {
            "heroes": FANDOM_HEROES_URL,
            "maps": FANDOM_HOME_URL,
            "api": FANDOM_API_URL,
        },
        "updatedAt": int(time.time()),
        "modes": list(MODES),
        "modeIcons": mode_icons,
        "roleIcons": role_icons,
        "maps": maps,
        "heroes": heroes,
    }
    assets["catalogHash"] = compute_catalog_hash(assets)
    (output_dir / "assets.json").write_text(
        json.dumps(assets, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    report("validate", 98, "目录和图片校验完成")
    validate_downloads(output_dir, downloads)
    report("publish", 100, "英文目录已准备完成")
    return assets


def fetch_parsed_page(page: str, deadline: float | None) -> str:
    check_deadline(deadline)
    query = urlencode(
        {
            "action": "parse",
            "page": page,
            "prop": "text",
            "format": "json",
            "formatversion": "2",
            "origin": "*",
        }
    )
    payload = fetch_json(f"{FANDOM_API_URL}?{query}", deadline)
    html = payload.get("parse", {}).get("text")
    if not isinstance(html, str) or not html:
        raise ValueError(f"Fandom did not return parsed HTML for {page}")
    return html


def parse_heroes(html: str, public_prefix: str) -> tuple[list[dict[str, str]], dict[str, dict[str, str]]]:
    soup = BeautifulSoup(html, "html.parser")
    heading = soup.find(id="Hero_roster")
    table = heading.find_parent("h2").find_next("table") if isinstance(heading, Tag) else None
    if not isinstance(table, Tag):
        raise ValueError("Hero roster table was not found")

    heroes: list[dict[str, str]] = []
    role_icons: dict[str, dict[str, str]] = {}
    seen: set[str] = set()
    current_role = ""

    for row in table.find_all("tr"):
        role_link = row.find("a", href=lambda value: isinstance(value, str) and value in {"/wiki/Roles#Tank", "/wiki/Roles#Damage", "/wiki/Roles#Support"})
        if isinstance(role_link, Tag):
            current_role = str(role_link.get("href")).rsplit("#", 1)[-1]
            icon = role_link.find("img") or row.find("img", alt=lambda value: isinstance(value, str) and value.lower().endswith("icon"))
            if isinstance(icon, Tag):
                role_icons[current_role] = build_icon_item(current_role, icon, "roles", public_prefix)

        if current_role not in ROLE_ZH:
            continue

        for image in row.find_all("img"):
            image_name = str(image.get("data-image-name") or image.get("alt") or "")
            if not image_name.lower().startswith("icon-"):
                continue
            cell = image.find_parent("td")
            name_link = cell.find("a", title=True) if isinstance(cell, Tag) else None
            name = str(name_link.get("title") if isinstance(name_link, Tag) else image_name[5:])
            name = name.removesuffix(".png").removesuffix(".webp").strip()
            key = normalize_key(name)
            if not key or key in seen:
                continue
            source = image_url(image, 160)
            file_name = asset_file_name(name, source, image_name)
            heroes.append(
                {
                    "nameEn": name,
                    "role": current_role,
                    "roleZh": ROLE_ZH[current_role],
                    "pageUrl": urljoin(FANDOM_HEROES_URL, str(name_link.get("href") or "")) if isinstance(name_link, Tag) else FANDOM_HEROES_URL,
                    "sourceImageUrl": source,
                    "imageUrl": f"{public_prefix}/heroes/{file_name}",
                    "fileName": file_name,
                }
            )
            seen.add(key)

    return heroes, role_icons


def parse_maps(html: str, public_prefix: str) -> tuple[dict[str, list[dict[str, str]]], dict[str, dict[str, str]]]:
    soup = BeautifulSoup(html, "html.parser")
    standard_label = soup.find("li", attrs={"data-hash": "Standard_Play"})
    standard_content = standard_label.find_next_sibling("div", class_="wds-tab__content") if isinstance(standard_label, Tag) else None
    if not isinstance(standard_content, Tag):
        standard_content = next(
            (
                item
                for item in soup.select(".wds-tab__content")
                if item.find(string=lambda value: isinstance(value, str) and value.strip() == "Standard Play")
            ),
            None,
        )
    if not isinstance(standard_content, Tag):
        raise ValueError("Standard Play map section was not found")

    maps: dict[str, list[dict[str, str]]] = {mode: [] for mode in MODES}
    mode_icons: dict[str, dict[str, str]] = {}
    seen: dict[str, set[str]] = {mode: set() for mode in MODES}
    current_mode = ""

    all_standard_modes = {*MODES, "Clash"}
    for child in standard_content.descendants:
        if not isinstance(child, Tag) or child.name != "div":
            continue
        mode_link = child.find("a", title=lambda value: value in all_standard_modes, recursive=False)
        if not isinstance(mode_link, Tag):
            bold = child.find("b", recursive=False)
            mode_link = bold.find("a", title=lambda value: value in all_standard_modes) if isinstance(bold, Tag) else None
        if isinstance(mode_link, Tag):
            current_mode = str(mode_link.get("title"))
            icon = child.find("img")
            if current_mode in MODES and isinstance(icon, Tag):
                mode_icons[current_mode] = build_icon_item(current_mode, icon, "modes", public_prefix)
            continue

        if "fpimagelink-mask" not in (child.get("class") or []):
            continue
        card = child.select_one(".fpimagelink")
        if current_mode not in MODES or not isinstance(card, Tag):
            continue
        text_link = card.select_one(".text a[title]")
        image = card.find("img")
        if not isinstance(text_link, Tag) or not isinstance(image, Tag):
            continue
        name = str(text_link.get("title") or text_link.get_text(" ", strip=True)).strip()
        if not name or name in seen[current_mode]:
            continue
        source = image_url(image, 800)
        file_name = asset_file_name(name, source, str(image.get("data-image-name") or image.get("alt") or ""))
        maps[current_mode].append(
            {
                "mode": current_mode,
                "nameEn": name,
                "pageUrl": urljoin(FANDOM_HOME_URL, str(text_link.get("href") or "")),
                "sourceImageUrl": source,
                "imageUrl": f"{public_prefix}/maps/{file_name}",
                "fileName": file_name,
            }
        )
        seen[current_mode].add(name)

    return maps, mode_icons


def build_icon_item(name: str, image: Tag, folder: str, public_prefix: str) -> dict[str, str]:
    source = image_url(image, 96)
    original_name = str(image.get("data-image-name") or image.get("alt") or "")
    file_name = asset_file_name(name, source, original_name)
    return {
        "mode" if folder == "modes" else "role": name,
        "sourceImageUrl": source,
        "imageUrl": f"{public_prefix}/{folder}/{file_name}",
        "fileName": file_name,
    }


def image_url(image: Tag, desired_width: int) -> str:
    source = str(image.get("data-src") or image.get("src") or "").strip()
    if not source or source.startswith("data:"):
        raise ValueError("Image is missing a non-placeholder source URL")
    source = urljoin(FANDOM_HOME_URL, source)
    validate_image_url(source)
    if "/revision/" in source:
        base, remainder = source.split("/revision/", 1)
        query = "?" + remainder.split("?", 1)[1] if "?" in remainder else ""
        source = f"{base}/revision/latest/scale-to-width-down/{desired_width}{query}"
    return source


def validate_image_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or (parsed.hostname or "").lower() not in TRUSTED_IMAGE_HOSTS:
        raise ValueError(f"Untrusted image URL: {url}")


def asset_file_name(name: str, source_url: str, original_name: str) -> str:
    suffix = Path(original_name).suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".svg"}:
        match = next((ext for ext in (".png", ".jpg", ".jpeg", ".webp", ".svg") if ext in urlparse(source_url).path.lower()), ".png")
        suffix = match
    digest = hashlib.sha256(source_url.encode("utf-8")).hexdigest()[:12]
    return f"{slugify(name)}-{digest}{suffix}"


def validate_parsed_catalog(
    heroes: list[dict[str, str]],
    maps: dict[str, list[dict[str, str]]],
    mode_icons: dict[str, dict[str, str]],
    role_icons: dict[str, dict[str, str]],
) -> None:
    if len(heroes) < 40:
        raise ValueError(f"Expected at least 40 heroes, found {len(heroes)}")
    if set(maps) != set(MODES) or any(not maps[mode] for mode in MODES):
        raise ValueError("One or more selected map modes are empty")
    if set(mode_icons) != set(MODES):
        raise ValueError("One or more mode icons are missing")
    if set(role_icons) != set(ROLE_ZH):
        raise ValueError("One or more role icons are missing")


def validate_downloads(output_dir: Path, downloads: list[tuple[str, Path]]) -> None:
    missing = [str(path.relative_to(output_dir)) for _url, path in downloads if not path.is_file() or path.stat().st_size == 0]
    if missing:
        raise ValueError("Missing downloaded assets: " + ", ".join(missing))


def fetch_json(url: str, deadline: float | None) -> dict[str, Any]:
    check_deadline(deadline)
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Expected an object from Fandom API")
    return payload


def download_image(url: str, path: Path, deadline: float | None) -> None:
    check_deadline(deadline)
    validate_image_url(url)
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "image/*"})
    with urlopen(request, timeout=30) as response:
        validate_image_url(response.geturl())
        content_type = response.headers.get_content_type()
        data = response.read()
    if not content_type.startswith("image/") or not data:
        raise ValueError(f"Invalid image response from {url}")
    path.write_bytes(data)


def check_deadline(deadline: float | None) -> None:
    if deadline is not None and time.monotonic() > deadline:
        raise TimeoutError("Catalog refresh exceeded ten minutes")


def publish_bundled(stage: Path, assets: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for folder in ("maps", "heroes", "modes", "roles"):
        source = stage / folder
        destination = STATIC_DIR / ("role-icons" if folder == "roles" else folder)
        destination.mkdir(parents=True, exist_ok=True)
        for source_file in source.iterdir():
            shutil.copy2(source_file, destination / source_file.name)

    temporary_assets = ASSETS_MANIFEST_PATH.with_name(f".{ASSETS_MANIFEST_PATH.name}.tmp")
    temporary_assets.write_text(json.dumps(assets, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_assets.replace(ASSETS_MANIFEST_PATH)
    maps_payload = {
        "schemaVersion": CATALOG_SCHEMA_VERSION,
        "source": FANDOM_HOME_URL,
        "updatedAt": assets["updatedAt"],
        "catalogHash": assets["catalogHash"],
        "modes": list(MODES),
        "maps": assets["maps"],
    }
    temporary_maps = MAPS_MANIFEST_PATH.with_name(f".{MAPS_MANIFEST_PATH.name}.tmp")
    temporary_maps.write_text(json.dumps(maps_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_maps.replace(MAPS_MANIFEST_PATH)


def normalize_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(character.lower() for character in normalized if character.isalnum() and not unicodedata.combining(character))


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(character for character in normalized if not unicodedata.combining(character))
    output = []
    previous_dash = False
    for character in ascii_value.lower():
        if character.isalnum():
            output.append(character)
            previous_dash = False
        elif not previous_dash:
            output.append("-")
            previous_dash = True
    return "".join(output).strip("-") or "asset"


if __name__ == "__main__":
    main()
