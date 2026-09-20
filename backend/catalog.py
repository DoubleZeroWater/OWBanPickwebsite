from __future__ import annotations

import hashlib
import json
import shutil
import time
import uuid
from copy import deepcopy
from pathlib import Path
from typing import Callable

from backend.domain.contracts import CatalogAssets, JsonObject

try:
    from backend.infrastructure.json_store import save_json_atomic
except ModuleNotFoundError:  # Support direct module execution from the backend directory.
    from infrastructure.json_store import save_json_atomic  # type: ignore[no-redef]


CATALOG_SCHEMA_VERSION = 1
TRANSLATION_SCHEMA_VERSION = 1
MODES = ["Escort", "Hybrid", "Control", "Push", "Flashpoint"]
SIDE_SELECTION_BY_MODE = {
    "Escort": "attack_defense",
    "Hybrid": "attack_defense",
    "Control": "red_blue",
    "Push": "red_blue",
    "Flashpoint": "red_blue",
}


def attach_map_capabilities(value: CatalogAssets) -> CatalogAssets:
    assets = deepcopy(value)
    for mode, items in assets.get("maps", {}).items():
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict):
                item.setdefault("sideSelectionKind", SIDE_SELECTION_BY_MODE.get(str(mode), "none"))
    return assets


def read_json(path: Path) -> JsonObject:
    try:
        with path.open(encoding="utf-8") as file:
            value = json.load(file)
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def catalog_keys(assets: CatalogAssets) -> dict[str, list[str]]:
    modes = [str(mode) for mode in assets.get("modes", []) if isinstance(mode, str)]
    maps = sorted(
        {
            str(map_info.get("nameEn"))
            for mode_maps in assets.get("maps", {}).values()
            if isinstance(mode_maps, list)
            for map_info in mode_maps
            if isinstance(map_info, dict) and map_info.get("nameEn")
        },
        key=str.casefold,
    )
    heroes = sorted(
        {
            str(hero.get("nameEn"))
            for hero in assets.get("heroes", [])
            if isinstance(hero, dict) and hero.get("nameEn")
        },
        key=str.casefold,
    )
    return {"modes": modes, "maps": maps, "heroes": heroes}


def _hash_catalog_signature(signature: JsonObject) -> str:
    canonical = json.dumps(
        signature,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compute_catalog_hash(assets: CatalogAssets) -> str:
    enriched = attach_map_capabilities(assets)
    signature: JsonObject = catalog_keys(enriched)
    signature["mapCapabilities"] = sorted(
        f"{item.get('nameEn')}:{item.get('sideSelectionKind')}"
        for items in enriched.get("maps", {}).values()
        for item in items if isinstance(item, dict) and item.get("nameEn")
    )
    return _hash_catalog_signature(signature)


def build_translation_template(assets: CatalogAssets) -> JsonObject:
    keys = catalog_keys(assets)
    return {
        "schemaVersion": TRANSLATION_SCHEMA_VERSION,
        "catalogHash": compute_catalog_hash(assets),
        "modes": {key: "" for key in keys["modes"]},
        "maps": {key: "" for key in keys["maps"]},
        "heroes": {key: "" for key in keys["heroes"]},
    }


def validate_translation(assets: CatalogAssets, translation: object) -> JsonObject:
    expected = catalog_keys(assets)
    diagnostics: JsonObject = {
        "valid": True,
        "versionMismatch": False,
        "hashMismatch": False,
        "missing": {"modes": [], "maps": [], "heroes": []},
        "extra": {"modes": [], "maps": [], "heroes": []},
        "blank": {"modes": [], "maps": [], "heroes": []},
        "typeErrors": [],
    }

    if not isinstance(translation, dict):
        diagnostics["typeErrors"].append("root")
        diagnostics["valid"] = False
        return diagnostics

    diagnostics["versionMismatch"] = translation.get("schemaVersion") != TRANSLATION_SCHEMA_VERSION
    diagnostics["hashMismatch"] = translation.get("catalogHash") not in {
        compute_catalog_hash(assets),
        _hash_catalog_signature(catalog_keys(assets)),
    }

    for category in ("modes", "maps", "heroes"):
        values = translation.get(category)
        if not isinstance(values, dict):
            diagnostics["typeErrors"].append(category)
            diagnostics["missing"][category] = expected[category]
            continue

        expected_keys = set(expected[category])
        actual_keys = {str(key) for key in values}
        diagnostics["missing"][category] = sorted(expected_keys - actual_keys, key=str.casefold)
        diagnostics["extra"][category] = sorted(actual_keys - expected_keys, key=str.casefold)
        diagnostics["blank"][category] = sorted(
            [
                key
                for key in expected_keys & actual_keys
                if not isinstance(values.get(key), str) or not values.get(key, "").strip()
            ],
            key=str.casefold,
        )

    diagnostics["valid"] = not (
        diagnostics["versionMismatch"]
        or diagnostics["hashMismatch"]
        or diagnostics["typeErrors"]
        or any(diagnostics["missing"][category] for category in expected)
        or any(diagnostics["extra"][category] for category in expected)
        or any(diagnostics["blank"][category] for category in expected)
    )
    return diagnostics


def load_catalog_assets(bundled_path: Path, runtime_catalog_dir: Path) -> tuple[CatalogAssets, str]:
    runtime_path = runtime_catalog_dir / "current" / "assets.json"
    runtime_assets = read_json(runtime_path)
    if is_complete_catalog(runtime_assets):
        return attach_map_capabilities(runtime_assets), "runtime"
    return attach_map_capabilities(read_json(bundled_path)), "bundled"


def load_translation(
    bundled_translation_path: Path,
    runtime_catalog_dir: Path,
) -> tuple[JsonObject, str]:
    runtime_path = runtime_catalog_dir / "translation.json"
    if runtime_path.is_file():
        return read_json(runtime_path), "runtime"
    return read_json(bundled_translation_path), "bundled"


def build_catalog_response(
    bundled_assets_path: Path,
    bundled_translation_path: Path,
    runtime_catalog_dir: Path,
) -> JsonObject:
    assets, catalog_source = load_catalog_assets(bundled_assets_path, runtime_catalog_dir)
    translation, translation_source = load_translation(bundled_translation_path, runtime_catalog_dir)
    diagnostics = validate_translation(assets, translation)
    active = bool(diagnostics["valid"])
    display_translation = {
        category: dict(translation.get(category, {})) if active else {}
        for category in ("modes", "maps", "heroes")
    }
    return {
        "modes": assets.get("modes") or list(assets.get("maps", {}).keys()),
        "modeIcons": assets.get("modeIcons", {}),
        "roleIcons": assets.get("roleIcons", {}),
        "maps": assets.get("maps", {}),
        "heroes": assets.get("heroes", []),
        "catalogHash": compute_catalog_hash(assets),
        "locale": "zh-CN" if active else "en",
        "translation": {"active": active, **display_translation},
        "translationStatus": {
            "source": translation_source,
            "diagnostics": diagnostics,
        },
        "catalogSource": catalog_source,
        "sources": assets.get("sources", {}),
        "updatedAt": assets.get("updatedAt"),
    }


def build_maintenance_status(
    bundled_assets_path: Path,
    bundled_translation_path: Path,
    runtime_catalog_dir: Path,
) -> JsonObject:
    response = build_catalog_response(
        bundled_assets_path,
        bundled_translation_path,
        runtime_catalog_dir,
    )
    assets, _ = load_catalog_assets(bundled_assets_path, runtime_catalog_dir)
    translation, translation_source = load_translation(bundled_translation_path, runtime_catalog_dir)
    return {
        "catalogHash": response["catalogHash"],
        "catalogSource": response["catalogSource"],
        "sources": response["sources"],
        "updatedAt": response["updatedAt"],
        "counts": {
            "modes": len(response["modes"]),
            "maps": sum(len(items) for items in response["maps"].values()),
            "heroes": len(response["heroes"]),
        },
        "translation": {
            "source": translation_source,
            "active": response["translation"]["active"],
            "diagnostics": response["translationStatus"]["diagnostics"],
            "document": translation,
        },
        "translationTemplate": build_translation_template(assets),
    }


def is_complete_catalog(assets: CatalogAssets) -> bool:
    if assets.get("schemaVersion") != CATALOG_SCHEMA_VERSION:
        return False
    if assets.get("modes") != MODES:
        return False
    if set(assets.get("maps", {})) != set(MODES):
        return False
    if any(not assets.get("maps", {}).get(mode) for mode in MODES):
        return False
    if not assets.get("heroes"):
        return False
    stored_hash = assets.get("catalogHash")
    # Runtime catalogs written before map capabilities became part of the
    # identity remain usable. Their response hash is upgraded in memory.
    legacy_hash = _hash_catalog_signature(catalog_keys(assets))
    return stored_hash in {compute_catalog_hash(assets), legacy_hash}


def allowed_runtime_asset_paths(assets: CatalogAssets) -> set[str]:
    allowed: set[str] = set()
    for mode_maps in assets.get("maps", {}).values():
        for item in mode_maps:
            if isinstance(item, dict) and item.get("fileName"):
                allowed.add(f"maps/{item['fileName']}")
    for item in assets.get("heroes", []):
        if isinstance(item, dict) and item.get("fileName"):
            allowed.add(f"heroes/{item['fileName']}")
    for category, folder in (("modeIcons", "modes"), ("roleIcons", "roles")):
        for item in assets.get(category, {}).values():
            if isinstance(item, dict) and item.get("fileName"):
                allowed.add(f"{folder}/{item['fileName']}")
    return allowed


def refresh_runtime_catalog(
    runtime_catalog_dir: Path,
    progress: Callable[[str, int, str], None] | None = None,
) -> CatalogAssets:
    # Imported lazily so importing Flask does not initialize scraper networking.
    from scripts.scrape_assets import scrape_catalog

    runtime_catalog_dir.mkdir(parents=True, exist_ok=True)
    stage = runtime_catalog_dir / f".staging-{uuid.uuid4().hex}"
    current = runtime_catalog_dir / "current"
    backup = runtime_catalog_dir / f".backup-{uuid.uuid4().hex}"

    try:
        assets = scrape_catalog(stage, "/runtime-assets", progress=progress, deadline=time.monotonic() + 600)
        if not is_complete_catalog(assets):
            raise ValueError("Scraped catalog failed completeness validation")

        if current.exists():
            current.replace(backup)
        try:
            stage.replace(current)
        except Exception:
            if backup.exists() and not current.exists():
                backup.replace(current)
            raise
        if backup.exists():
            shutil.rmtree(backup, ignore_errors=True)
        return assets
    finally:
        if stage.exists():
            shutil.rmtree(stage, ignore_errors=True)
