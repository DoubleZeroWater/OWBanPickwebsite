from __future__ import annotations

import json
import os
import subprocess
import sys
import unicodedata
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, redirect, send_from_directory


ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist"
STATIC_DIR = ROOT / "static"
ASSETS_DATA_PATH = ROOT / "backend" / "data" / "assets.json"
MAPS_DATA_PATH = ROOT / "backend" / "data" / "maps.json"
ASSET_SCRIPT_PATH = ROOT / "scripts" / "scrape_assets.py"
MAP_PLACEHOLDER = "/static/placeholders/map-blank.svg"
HERO_PLACEHOLDER = "/static/placeholders/hero-blank.svg"
SETTINGS_PRESET_PATH = ROOT / "backend" / "data" / "settings_preset.json"
SETTINGS_PRESETS_PATH = ROOT / "backend" / "data" / "settings_presets.json"


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")

    @app.get("/")
    def index() -> Any:
        return redirect("/A")

    @app.get("/<portal_code>")
    def match_portal_page(portal_code: str) -> Any:
        if portal_code.upper() not in {"A", "B", "C", "D"}:
            return redirect("/A")

        if not (DIST_DIR / "index.html").exists():
            return (
                "Frontend assets are missing. Run `npm install` and `npm run build` "
                "before opening /A, /B, /C, or /D.",
                503,
            )
        return send_from_directory(DIST_DIR, "index.html")

    @app.get("/assets/<path:filename>")
    def frontend_assets(filename: str) -> Any:
        return send_from_directory(DIST_DIR / "assets", filename)

    @app.get("/api/matches/<room_code>/state")
    def match_state(room_code: str) -> Any:
        return jsonify(build_match_state(room_code))

    @app.get("/api/maps/catalog")
    def maps_catalog() -> Any:
        return jsonify(build_maps_catalog())

    @app.get("/api/settings/preset")
    def get_settings_preset() -> Any:
        return jsonify(load_settings_preset())

    @app.post("/api/settings/preset")
    def save_settings_preset() -> Any:
        from flask import request

        payload = request.get_json(silent=True) or {}
        name = str(payload.get("name") or "默认预设").strip() or "默认预设"
        settings = payload.get("settings", payload)
        presets_payload = load_settings_preset()
        presets = presets_payload.setdefault("presets", {})
        presets[name] = settings
        presets_payload["last"] = name
        SETTINGS_PRESETS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with SETTINGS_PRESETS_PATH.open("w", encoding="utf-8") as file:
            json.dump(presets_payload, file, ensure_ascii=False, indent=2)
        return jsonify({"ok": True, "name": name})

    return app


def build_match_state(room_code: str) -> dict[str, Any]:
    """Return the display model for the tournament admin match page."""

    assets = load_assets()

    return {
        "roomCode": room_code,
        "matchName": "OW Ban Pick Invitational",
        "phase": "after",
        "currentCountdownSeconds": 116,
        "currentOperation": "等待赛事管理员根据选择设置下一张地图",
        "teams": {
            "left": {
                "id": "team-a",
                "name": "蓝色方",
                "seriesScore": 1,
                "seed": 1,
            },
            "right": {
                "id": "team-b",
                "name": "红色方",
                "seriesScore": 0,
                "seed": 2,
            },
        },
        "maps": [
            {
                "id": "lijang-tower",
                "mode": "Control",
                "modeIconUrl": mode_icon(assets, "Control"),
                "nameZh": "漓江塔",
                "nameEn": "Lijiang Tower",
                "status": "completed",
                "imageUrl": map_image(assets, "Control", "Lijiang Tower"),
                "score": {"left": 2, "right": 1},
                "bans": {
                    "left": hero_ban(assets, "Ana", "安娜", "支援"),
                    "right": hero_ban(assets, "Tracer", "猎空", "输出"),
                },
                "firstBanSide": "left",
            },
            {
                "id": "kings-row",
                "mode": "Hybrid",
                "modeIconUrl": mode_icon(assets, "Hybrid"),
                "nameZh": "国王大道",
                "nameEn": "King's Row",
                "status": "after",
                "imageUrl": map_image(assets, "Hybrid", "King's Row"),
                "score": {"left": None, "right": None},
                "bans": {
                    "left": hero_ban(assets, "Mauga", "毛加", "重装"),
                    "right": hero_ban(assets, "Lúcio", "卢西奥", "支援"),
                },
                "firstBanSide": "right",
            },
            {
                "id": "tbd-3",
                "mode": None,
                "modeIconUrl": None,
                "nameZh": None,
                "nameEn": None,
                "status": "tbd",
                "imageUrl": MAP_PLACEHOLDER,
                "score": {"left": None, "right": None},
                "bans": {"left": None, "right": None},
                "firstBanSide": None,
            },
            {
                "id": "tbd-4",
                "mode": None,
                "modeIconUrl": None,
                "nameZh": None,
                "nameEn": None,
                "status": "tbd",
                "imageUrl": MAP_PLACEHOLDER,
                "score": {"left": None, "right": None},
                "bans": {"left": None, "right": None},
                "firstBanSide": None,
            },
            {
                "id": "tbd-5",
                "mode": None,
                "modeIconUrl": None,
                "nameZh": None,
                "nameEn": None,
                "status": "tbd",
                "imageUrl": MAP_PLACEHOLDER,
                "score": {"left": None, "right": None},
                "bans": {"left": None, "right": None},
                "firstBanSide": None,
            },
        ],
    }


def build_maps_catalog() -> dict[str, Any]:
    assets = load_assets()
    maps = assets.get("maps", {})

    return {
        "modes": assets.get("modes") or list(maps.keys()),
        "modeIcons": assets.get("modeIcons", {}),
        "maps": maps,
        "heroes": assets.get("heroes", []),
    }


def refresh_static_assets() -> None:
    if os.environ.get("OW_REFRESH_ASSETS_ON_STARTUP", "").lower() not in {"1", "true", "yes"}:
        return

    if not ASSET_SCRIPT_PATH.exists():
        return

    try:
        result = subprocess.run(
            [sys.executable, str(ASSET_SCRIPT_PATH)],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
            timeout=180,
        )
    except Exception as exc:
        print(f"Asset refresh skipped: {exc}")
        return

    if result.stdout:
        print(result.stdout.strip())
    if result.returncode != 0:
        print(result.stderr.strip())
        print(f"Asset refresh exited with {result.returncode}; continuing with cached data.")



def load_settings_preset() -> dict[str, Any]:
    if SETTINGS_PRESETS_PATH.exists():
        with SETTINGS_PRESETS_PATH.open(encoding="utf-8") as file:
            return json.load(file)

    if SETTINGS_PRESET_PATH.exists():
        with SETTINGS_PRESET_PATH.open(encoding="utf-8") as file:
            return {"presets": {"默认预设": json.load(file)}, "last": "默认预设"}
    return {"presets": {}, "last": None}

def load_assets() -> dict[str, Any]:
    if ASSETS_DATA_PATH.exists():
        with ASSETS_DATA_PATH.open(encoding="utf-8") as file:
            return json.load(file)

    if not MAPS_DATA_PATH.exists():
        return {}

    with MAPS_DATA_PATH.open(encoding="utf-8") as file:
        payload = json.load(file)

    return {"maps": payload.get("maps", {}), "modeIcons": {}, "heroes": []}


def map_catalog(assets: dict[str, Any]) -> dict[str, dict[str, str]]:
    catalog: dict[str, dict[str, str]] = {}
    for mode, maps in assets.get("maps", {}).items():
        for map_info in maps:
            catalog[f"{mode}:{map_info['nameEn']}"] = map_info
    return catalog


def hero_catalog(assets: dict[str, Any]) -> dict[str, dict[str, str]]:
    catalog: dict[str, dict[str, str]] = {}
    for hero in assets.get("heroes", []):
        catalog[normalize_key(hero["nameEn"])] = hero
    return catalog


def map_image(assets: dict[str, Any], mode: str, name_en: str) -> str:
    return map_catalog(assets).get(f"{mode}:{name_en}", {}).get(
        "imageUrl",
        MAP_PLACEHOLDER,
    )


def mode_icon(assets: dict[str, Any], mode: str) -> str | None:
    return assets.get("modeIcons", {}).get(mode, {}).get("imageUrl")


def hero_ban(assets: dict[str, Any], name_en: str, name_zh: str, role: str) -> dict[str, str]:
    hero = hero_catalog(assets).get(normalize_key(name_en), {})
    return {
        "hero": name_zh,
        "nameEn": name_en,
        "role": role,
        "imageUrl": hero.get("imageUrl", HERO_PLACEHOLDER),
    }


def normalize_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    stripped = "".join(character for character in normalized if not unicodedata.combining(character))
    return "".join(character.lower() for character in stripped if character.isalnum())


refresh_static_assets()
app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5174, debug=True, use_reloader=False)
