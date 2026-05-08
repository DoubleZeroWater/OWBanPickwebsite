from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, redirect, send_from_directory


ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist"
STATIC_DIR = ROOT / "static"
MAPS_DATA_PATH = ROOT / "backend" / "data" / "maps.json"


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")

    @app.get("/")
    def index() -> Any:
        return redirect("/A")

    @app.get("/A")
    def match_admin_page() -> Any:
        if not (DIST_DIR / "index.html").exists():
            return (
                "Frontend assets are missing. Run `npm install` and `npm run build` "
                "before opening /A.",
                503,
            )
        return send_from_directory(DIST_DIR, "index.html")

    @app.get("/assets/<path:filename>")
    def frontend_assets(filename: str) -> Any:
        return send_from_directory(DIST_DIR / "assets", filename)

    @app.get("/api/matches/<room_code>/state")
    def match_state(room_code: str) -> Any:
        return jsonify(build_match_state(room_code))

    return app


def build_match_state(room_code: str) -> dict[str, Any]:
    """Return the display model for the tournament admin match page."""

    map_catalog = load_map_catalog()

    return {
        "roomCode": room_code,
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
                "nameZh": "漓江塔",
                "nameEn": "Lijiang Tower",
                "status": "completed",
                "imageUrl": map_image(map_catalog, "Control", "Lijiang Tower"),
                "score": {"left": 2, "right": 1},
                "bans": {
                    "left": {"hero": "安娜", "role": "支援"},
                    "right": {"hero": "猎空", "role": "输出"},
                },
                "firstBanSide": "left",
            },
            {
                "id": "kings-row",
                "mode": "Hybrid",
                "nameZh": "国王大道",
                "nameEn": "King's Row",
                "status": "after",
                "imageUrl": map_image(map_catalog, "Hybrid", "King's Row"),
                "score": {"left": None, "right": None},
                "bans": {
                    "left": {"hero": "温斯顿", "role": "重装"},
                    "right": {"hero": "卢西奥", "role": "支援"},
                },
                "firstBanSide": "right",
            },
            {
                "id": "tbd-3",
                "mode": None,
                "nameZh": None,
                "nameEn": None,
                "status": "tbd",
                "imageUrl": "/static/placeholders/map-blank.svg",
                "score": {"left": None, "right": None},
                "bans": {"left": None, "right": None},
                "firstBanSide": None,
            },
            {
                "id": "tbd-4",
                "mode": None,
                "nameZh": None,
                "nameEn": None,
                "status": "tbd",
                "imageUrl": "/static/placeholders/map-blank.svg",
                "score": {"left": None, "right": None},
                "bans": {"left": None, "right": None},
                "firstBanSide": None,
            },
            {
                "id": "tbd-5",
                "mode": None,
                "nameZh": None,
                "nameEn": None,
                "status": "tbd",
                "imageUrl": "/static/placeholders/map-blank.svg",
                "score": {"left": None, "right": None},
                "bans": {"left": None, "right": None},
                "firstBanSide": None,
            },
        ],
    }


def load_map_catalog() -> dict[str, dict[str, str]]:
    if not MAPS_DATA_PATH.exists():
        return {}

    with MAPS_DATA_PATH.open(encoding="utf-8") as file:
        payload = json.load(file)

    catalog: dict[str, dict[str, str]] = {}
    for mode, maps in payload.get("maps", {}).items():
        for map_info in maps:
            catalog[f"{mode}:{map_info['nameEn']}"] = map_info
    return catalog


def map_image(catalog: dict[str, dict[str, str]], mode: str, name_en: str) -> str:
    return catalog.get(f"{mode}:{name_en}", {}).get(
        "imageUrl",
        "/static/placeholders/map-blank.svg",
    )


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5174, debug=True)
