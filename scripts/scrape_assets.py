from __future__ import annotations

import json
import re
import unicodedata
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "static"
MAP_DIR = STATIC_DIR / "maps"
HERO_DIR = STATIC_DIR / "heroes"
MODE_DIR = STATIC_DIR / "modes"
DATA_DIR = ROOT / "backend" / "data"
ASSETS_MANIFEST_PATH = DATA_DIR / "assets.json"
MAPS_MANIFEST_PATH = DATA_DIR / "maps.json"

LIQUIPEDIA_MAPS_URL = "https://liquipedia.net/overwatch/Portal:Maps"
FANDOM_API_URL = "https://overwatch.fandom.com/api.php"
FANDOM_HEROES_URL = "https://overwatch.fandom.com/wiki/Heroes"
USER_AGENT = "Mozilla/5.0 OWBanPickwebsite asset scraper"

MODES = ["Control", "Escort", "Flashpoint", "Hybrid", "Push"]
MODE_ICON_FILES = {
    "Control": "Control.png",
    "Escort": "Escort.png",
    "Flashpoint": "Flashpoint.png",
    "Hybrid": "Hybrid.png",
    "Push": "Push.png",
}

ROLE_ZH = {
    "Tank": "重装",
    "Damage": "输出",
    "Support": "支援",
}

FALLBACK_HEROES = [
    ("D.Va", "Tank"),
    ("Doomfist", "Tank"),
    ("Hazard", "Tank"),
    ("Junker Queen", "Tank"),
    ("Mauga", "Tank"),
    ("Orisa", "Tank"),
    ("Ramattra", "Tank"),
    ("Reinhardt", "Tank"),
    ("Roadhog", "Tank"),
    ("Sigma", "Tank"),
    ("Winston", "Tank"),
    ("Wrecking Ball", "Tank"),
    ("Zarya", "Tank"),
    ("Ashe", "Damage"),
    ("Bastion", "Damage"),
    ("Cassidy", "Damage"),
    ("Echo", "Damage"),
    ("Freja", "Damage"),
    ("Genji", "Damage"),
    ("Hanzo", "Damage"),
    ("Junkrat", "Damage"),
    ("Mei", "Damage"),
    ("Pharah", "Damage"),
    ("Reaper", "Damage"),
    ("Sojourn", "Damage"),
    ("Soldier: 76", "Damage"),
    ("Sombra", "Damage"),
    ("Symmetra", "Damage"),
    ("Torbjörn", "Damage"),
    ("Tracer", "Damage"),
    ("Venture", "Damage"),
    ("Widowmaker", "Damage"),
    ("Ana", "Support"),
    ("Baptiste", "Support"),
    ("Brigitte", "Support"),
    ("Illari", "Support"),
    ("Juno", "Support"),
    ("Kiriko", "Support"),
    ("Lifeweaver", "Support"),
    ("Lúcio", "Support"),
    ("Mercy", "Support"),
    ("Moira", "Support"),
    ("Zenyatta", "Support"),
    ("Anran", "Damage"),
    ("Domina", "Tank"),
    ("Emre", "Damage"),
    ("Mizuki", "Support"),
    ("Vendetta", "Damage"),
    ("Wuyang", "Support"),
]


def main() -> None:
    for directory in [MAP_DIR, HERO_DIR, MODE_DIR, DATA_DIR]:
        directory.mkdir(parents=True, exist_ok=True)

    previous = read_json(ASSETS_MANIFEST_PATH)
    errors: list[str] = []

    maps = previous.get("maps", {})
    try:
        maps = scrape_maps()
    except Exception as exc:  # pragma: no cover - network fallback
        errors.append(f"maps: {exc}")

    mode_icons = previous.get("modeIcons", {})
    try:
        mode_icons = scrape_mode_icons()
    except Exception as exc:  # pragma: no cover - network fallback
        errors.append(f"mode icons: {exc}")

    heroes = previous.get("heroes", [])
    try:
        heroes = scrape_heroes()
    except Exception as exc:  # pragma: no cover - network fallback
        errors.append(f"heroes: {exc}")

    manifest = {
        "sources": {
            "maps": LIQUIPEDIA_MAPS_URL,
            "modeIcons": FANDOM_API_URL,
            "heroes": FANDOM_HEROES_URL,
        },
        "modes": MODES,
        "modeIcons": mode_icons,
        "maps": maps,
        "heroes": heroes,
        "errors": errors,
    }

    ASSETS_MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    MAPS_MANIFEST_PATH.write_text(
        json.dumps(
            {
                "source": LIQUIPEDIA_MAPS_URL,
                "modes": MODES,
                "maps": maps,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    map_count = sum(len(items) for items in maps.values())
    print(
        f"Prepared {map_count} maps, {len(mode_icons)} mode icons, "
        f"{len(heroes)} hero icons."
    )
    if errors:
        print("Asset refresh used cached data for: " + "; ".join(errors))


def scrape_maps() -> dict[str, list[dict[str, str]]]:
    html = fetch_text(LIQUIPEDIA_MAPS_URL)
    manifest: dict[str, list[dict[str, str]]] = {}

    for index, mode in enumerate(MODES):
        next_mode = MODES[index + 1] if index + 1 < len(MODES) else None
        section = extract_mode_section(html, mode, next_mode)
        regular_section = section.split("Stadium Exclusive", 1)[0]
        manifest[mode] = extract_maps(regular_section, mode)

    for maps in manifest.values():
        for map_info in maps:
            download_image(map_info["sourceImageUrl"], MAP_DIR / map_info["fileName"])

    return manifest


def scrape_mode_icons() -> dict[str, dict[str, str]]:
    icons: dict[str, dict[str, str]] = {}

    for mode, file_name in MODE_ICON_FILES.items():
        image_url = fetch_fandom_file_url(file_name)
        local_file_name = f"{slugify(mode)}{Path(file_name).suffix.lower()}"
        download_image(image_url, MODE_DIR / local_file_name)
        icons[mode] = {
            "mode": mode,
            "sourceImageUrl": image_url,
            "imageUrl": f"/static/modes/{local_file_name}",
            "fileName": local_file_name,
        }

    return icons


def scrape_heroes() -> list[dict[str, str]]:
    try:
        html = fetch_text(FANDOM_HEROES_URL)
        page_heroes = extract_heroes_from_page(html)
    except Exception:
        page_heroes = {}

    hero_by_key = {
        normalize_key(name): {
            "nameEn": name,
            "role": role,
            "roleZh": ROLE_ZH.get(role, role),
        }
        for name, role in FALLBACK_HEROES
    }

    for hero in page_heroes.values():
        existing = hero_by_key.get(normalize_key(hero["nameEn"]), {})
        hero_by_key[normalize_key(hero["nameEn"])] = {
            "nameEn": hero["nameEn"],
            "role": existing.get("role", hero.get("role", "")),
            "roleZh": existing.get("roleZh", ROLE_ZH.get(hero.get("role", ""), "")),
            "pageImageUrl": hero.get("pageImageUrl", ""),
        }

    heroes: list[dict[str, str]] = []
    for hero in sorted(hero_by_key.values(), key=lambda item: item["nameEn"].lower()):
        image_url = hero.get("pageImageUrl") or find_hero_image_url(hero["nameEn"])
        if not image_url:
            continue

        extension = image_extension(image_url, ".png")
        file_name = f"{slugify(hero['nameEn'])}{extension}"
        download_image(image_url, HERO_DIR / file_name)
        heroes.append(
            {
                "nameEn": hero["nameEn"],
                "role": hero.get("role", ""),
                "roleZh": hero.get("roleZh", ""),
                "sourceImageUrl": image_url,
                "imageUrl": f"/static/heroes/{file_name}",
                "fileName": file_name,
            }
        )

    return heroes


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def fetch_json(url: str) -> dict[str, Any]:
    return json.loads(fetch_text(url))


def fetch_fandom_file_url(file_name: str) -> str:
    params = urlencode(
        {
            "action": "query",
            "titles": f"File:{file_name}",
            "prop": "imageinfo",
            "iiprop": "url",
            "format": "json",
        }
    )
    payload = fetch_json(f"{FANDOM_API_URL}?{params}")
    pages = payload.get("query", {}).get("pages", {})

    for page in pages.values():
        image_info = page.get("imageinfo", [])
        if image_info:
            return image_info[0]["url"]

    raise ValueError(f"Unable to resolve Fandom file: {file_name}")


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

        image_url = urljoin(LIQUIPEDIA_MAPS_URL, unescape(match.group("src")))
        file_name = build_map_file_name(name, image_url)
        maps.append(
            {
                "mode": mode,
                "nameEn": name,
                "pageUrl": urljoin(LIQUIPEDIA_MAPS_URL, unescape(match.group("href"))),
                "sourceImageUrl": image_url,
                "imageUrl": f"/static/maps/{file_name}",
                "fileName": file_name,
            }
        )
        seen.add(name)

    return maps


def extract_heroes_from_page(html: str) -> dict[str, dict[str, str]]:
    heroes: dict[str, dict[str, str]] = {}

    for tag in re.findall(r"<img\b[^>]*>", html, re.I | re.S):
        image_name_match = re.search(r'data-image-name="Icon-([^"]+?)\.(?:png|webp)"', tag, re.I)
        if not image_name_match:
            image_name_match = re.search(r'alt="Icon-([^"]+)"', tag, re.I)
        if not image_name_match:
            continue

        name = normalize_hero_display_name(unescape(image_name_match.group(1)))
        if not name or name.lower() in {"tank", "damage", "support"}:
            continue

        image_url = find_img_url(tag)
        heroes[normalize_key(name)] = {
            "nameEn": name,
            "pageImageUrl": image_url,
        }

    return heroes


def find_img_url(tag: str) -> str:
    for attribute in ["data-src", "src"]:
        match = re.search(rf'{attribute}="([^"]+)"', tag, re.I)
        if match:
            url = unescape(match.group(1))
            if not url.startswith("data:"):
                return urljoin(FANDOM_HEROES_URL, url)
    return ""


def find_hero_image_url(hero_name: str) -> str:
    file_names = [
        f"Icon-{hero_name}.png",
        f"Icon-{hero_name.replace(':', '')}.png",
        f"Icon-{hero_name.replace(': ', ' ')}.png",
    ]

    if hero_name == "Lúcio":
        file_names.extend(["Icon-Lucio.png", "Icon-Lúcio.png"])
    if hero_name == "Torbjörn":
        file_names.extend(["Icon-Torbjorn.png", "Icon-Torbjörn.png"])

    for file_name in dict.fromkeys(file_names):
        try:
            return fetch_fandom_file_url(file_name)
        except Exception:
            continue

    return ""


def build_map_file_name(name: str, image_url: str) -> str:
    source_name = urlparse(image_url).path.rsplit("/", 1)[-1]
    source_name = re.sub(r"^\d+px-", "", source_name)
    suffix = Path(source_name).suffix.lower() or ".jpg"
    return f"{slugify(name)}{suffix}"


def image_extension(url: str, fallback: str) -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return suffix
    return fallback


def download_image(url: str, path: Path) -> None:
    if path.exists() and path.stat().st_size > 0:
        return

    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        path.write_bytes(response.read())


def normalize_hero_display_name(value: str) -> str:
    name = value.strip().replace("_", " ")
    name = re.sub(r"\.(?:png|webp)$", "", name, flags=re.I)
    return name


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", strip_accents(value).lower())


def slugify(value: str) -> str:
    stripped = strip_accents(value)
    return re.sub(r"[^a-z0-9]+", "-", stripped.lower()).strip("-")


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(character for character in normalized if not unicodedata.combining(character))


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    with path.open(encoding="utf-8") as file:
        return json.load(file)


if __name__ == "__main__":
    main()
